"""Commander 命令执行后端

封装 pyOCD 的 CommandExecutionContext，为每个已连接探针维护一个命令执行上下文，
支持通过 REST API 同步执行 Commander REPL 命令并捕获输出。

复用 pyOCD 全部 49 个内置命令（reg/read32/write32/break/step/halt/disasm 等），
无需自研命令解析。
"""

import io
import sys
import contextlib
import threading
import logging
from typing import Optional

from core.pyocd_backend import backend
from core.events import event_manager

logger = logging.getLogger(__name__)

# 不需要连接探针即可执行的命令
# list: 列出已连接探针; help: 显示帮助; exit/quit: 退出; !: shell 命令
OFFLINE_COMMANDS = {'list', 'help', 'exit', 'quit', '!'}


class CommanderBackend:
    """Commander 命令执行后端

    为每个探针维护一个 CommandExecutionContext，复用 pyOCD 的命令系统。
    线程安全：每个探针一把锁，命令串行执行。
    """

    def __init__(self):
        # uid -> (CommandExecutionContext, StringIO, Lock)
        self._contexts: dict[str, tuple[object, io.StringIO, threading.Lock]] = {}

    def _get_or_create_context(self, uid: str):
        """获取或创建探针的命令执行上下文。

        Returns:
            (context, output_buf, lock) 或 None（探针未连接）
        """
        # 已有上下文且探针仍连接，直接返回
        if uid in self._contexts:
            ctx, buf, lock = self._contexts[uid]
            if backend.is_connected(uid):
                return ctx, buf, lock
            # 探针已断开，清理失效上下文
            self._cleanup_context(uid)

        # 探针未连接
        if not backend.is_connected(uid):
            return None

        # 从 backend 获取已打开的 pyOCD session
        session = backend._get_session(uid)
        if session is None:
            return None

        from pyocd.commands.execution_context import CommandExecutionContext
        from pyocd.commands.repl import ToolExitException  # noqa: F401  (用于类型识别)

        output_buf = io.StringIO()
        ctx = CommandExecutionContext(output_stream=output_buf)

        # 加载 commander 命令组（standard 已在构造函数中加载）
        ctx.command_set.add_command_group('commander')

        # 绑定 session（assert session.is_open，已在 connect 时 open）
        ctx.attach_session(session)

        lock = threading.Lock()
        self._contexts[uid] = (ctx, output_buf, lock)

        logger.info(f"Commander context created for probe {uid[:16]}")
        return ctx, output_buf, lock

    def _execute_batch(self, uid: str, script_path: str) -> dict:
        """从文件批量执行 Commander 命令

        读取文本文件，每行作为一条 Commander REPL 命令依次执行。
        类似 `pyocd commander -x commands.txt` 的功能。

        文件格式：
            - 每行一条命令（如 "halt"、"read32 0x20000000 16"）
            - 以 # 开头的行为注释，跳过
            - 空行跳过

        Args:
            uid: 探针唯一 ID
            script_path: 命令脚本文件路径

        Returns:
            {success, output, error, command}
        """
        command = f"run_batch {script_path}"

        if not script_path:
            return {
                "success": False,
                "output": "",
                "error": "Usage: run_batch <commands.txt>\nExecute Commander commands from a text file, one command per line.\nLines starting with # are comments.",
                "command": command,
            }

        import os
        script_path = os.path.expanduser(script_path)
        if not os.path.isabs(script_path):
            script_path = os.path.join(os.path.expanduser('~'), script_path)

        if not os.path.isfile(script_path):
            return {
                "success": False,
                "output": "",
                "error": f"File not found: {script_path}",
                "command": command,
            }

        try:
            with open(script_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
        except Exception as e:
            return {
                "success": False,
                "output": "",
                "error": f"Failed to read script: {e}",
                "command": command,
            }

        # 获取命令执行上下文
        result = self._get_or_create_context(uid)
        if result is None:
            return {
                "success": False,
                "output": "",
                "error": "Probe not connected. run_batch requires a connected probe.",
                "command": command,
            }

        ctx, buf, lock = result

        all_output = []
        executed = 0
        failed = 0

        with lock:
            for line_num, raw_line in enumerate(lines, 1):
                line = raw_line.strip()
                # 跳过空行和注释
                if not line or line.startswith('#'):
                    continue

                # 清空缓冲
                buf.seek(0)
                buf.truncate(0)

                all_output.append(f"$ {line}\n")

                try:
                    with contextlib.redirect_stdout(buf):
                        ctx.process_command_line(line)
                    output = buf.getvalue()
                    if output:
                        all_output.append(output)
                    executed += 1
                except Exception as e:
                    output = buf.getvalue()
                    if output:
                        all_output.append(output)
                    exc_type = type(e).__name__
                    error_msg = str(e) if str(e) else exc_type
                    all_output.append(f"Error: {error_msg}\n")
                    failed += 1
                    logger.warning(f"Batch command '{line}' failed: {exc_type}: {error_msg}")

        summary = f"\n--- Batch complete: {executed} succeeded, {failed} failed ---\n"
        all_output.append(summary)

        return {
            "success": failed == 0,
            "output": ''.join(all_output),
            "error": None if failed == 0 else f"{failed} commands failed",
            "command": command,
        }

    def _execute_script(self, uid: str, script_path: str) -> dict:
        """导入并执行 Python 脚本

        用 exec() 在 pyOCD session 的 Python 命名空间中执行脚本，
        支持多行语句（for/if/def/赋值等），弥补 $ 前缀仅支持 eval() 的限制。

        脚本中可访问的变量：
            - session: 当前 pyOCD Session
            - target: Target 对象
            - board: Board 对象
            - probe: DebugProbe 对象
            - elf: ELF 文件对象（已加载时）
            - map: 内存映射
            - dp: DebugPort 对象
            - print(): 输出到终端

        Args:
            uid: 探针唯一 ID
            script_path: .py 脚本文件路径

        Returns:
            {success, output, error, command}
        """
        command = f"run {script_path}"

        if not script_path:
            return {
                "success": False,
                "output": "",
                "error": "Usage: run <script.py>\nRun a Python script with access to target/session/board/probe objects.",
                "command": command,
            }

        # 读取脚本文件
        import os
        script_path = os.path.expanduser(script_path)
        if not os.path.isabs(script_path):
            # 相对路径基于用户主目录
            script_path = os.path.join(os.path.expanduser('~'), script_path)

        if not os.path.isfile(script_path):
            return {
                "success": False,
                "output": "",
                "error": f"File not found: {script_path}",
                "command": command,
            }

        try:
            with open(script_path, 'r', encoding='utf-8') as f:
                script_source = f.read()
        except Exception as e:
            return {
                "success": False,
                "output": "",
                "error": f"Failed to read script: {e}",
                "command": command,
            }

        # 获取命令执行上下文
        result = self._get_or_create_context(uid)
        if result is None:
            return {
                "success": False,
                "output": "",
                "error": "Probe not connected",
                "command": command,
            }

        ctx, buf, lock = result

        with lock:
            buf.seek(0)
            buf.truncate(0)

            try:
                # 构建 Python 命名空间（复用 pyOCD 的 _python_namespace）
                if not ctx._python_namespace:
                    ctx._build_python_namespace()

                ns = ctx._python_namespace

                # 编译并执行脚本
                script_code = compile(script_source, script_path, 'exec')

                # 重定向 print() 输出到终端
                session = ctx.session
                if session:
                    with session.user_script_print_proxy.push_target(ctx.write):
                        exec(script_code, ns)
                else:
                    exec(script_code, ns)

                output = buf.getvalue()
                return {
                    "success": True,
                    "output": output,
                    "error": None,
                    "command": command,
                }
            except Exception as e:
                output = buf.getvalue()
                import traceback
                tb = traceback.format_exc()
                logger.warning(f"Script execution failed: {e}\n{tb}")
                return {
                    "success": False,
                    "output": output,
                    "error": f"{e}\n{tb}",
                    "command": command,
                }

    def _cleanup_context(self, uid: str):
        """清理探针的命令上下文"""
        self._contexts.pop(uid, None)

    def _get_or_create_offline_context(self):
        """创建无 session 的临时上下文（用于 list/help/! 等离线命令）

        Returns:
            (context, output_buf, lock) 或 None
        """
        from pyocd.commands.execution_context import CommandExecutionContext

        output_buf = io.StringIO()
        ctx = CommandExecutionContext(output_stream=output_buf)
        ctx.command_set.add_command_group('commander')

        lock = threading.Lock()
        return ctx, output_buf, lock

    def execute(self, uid: str, command: str) -> dict:
        """执行一条 Commander 命令

        Args:
            uid: 探针唯一 ID
            command: 命令字符串（如 "read32 0x20000000 16"）

        Returns:
            {success, output, error, command}
        """
        command = command.strip()
        if not command:
            return {"success": False, "output": "", "error": "Empty command", "command": command}

        # 拦截 'run <filepath>' 命令：导入并执行 Python 脚本
        if command.startswith('run ') or command == 'run':
            return self._execute_script(uid, command[4:].strip() if len(command) > 4 else '')

        # 拦截 'run_batch <filepath>' 命令：从文件批量执行 Commander 命令
        if command.startswith('run_batch ') or command == 'run_batch':
            return self._execute_batch(uid, command[10:].strip() if len(command) > 10 else '')

        # 判断命令是否需要连接探针
        # ! 和 $ 前缀命令：! 是 shell 命令（离线可用），$ 是 Python 表达式（需要连接）
        # list/help/exit/quit 是离线命令
        is_offline_cmd = (
            command.startswith('!')
            or command.split()[0].lower() in OFFLINE_COMMANDS if command.split() else False
        )

        # 尝试获取已连接的上下文
        result = self._get_or_create_context(uid)

        # 探针未连接且命令需要连接
        if result is None and not is_offline_cmd:
            return {
                "success": False,
                "output": "",
                "error": "Probe not connected. Use 'list' to see available probes, or connect a probe first.",
                "command": command,
            }

        # 探针未连接但命令可离线执行
        if result is None:
            result = self._get_or_create_offline_context()

        ctx, buf, lock = result

        with lock:
            # 清空输出缓冲
            buf.seek(0)
            buf.truncate(0)

            try:
                # 重定向 stdout 到 StringIO，捕获 print() 输出
                # （list 等命令用 print() 而非 ctx.write）
                with contextlib.redirect_stdout(buf):
                    ctx.process_command_line(command)
                output = buf.getvalue()
                return {
                    "success": True,
                    "output": output,
                    "error": None,
                    "command": command,
                }
            except Exception as e:
                # 捕获输出（命令可能已部分输出后报错）
                output = buf.getvalue()
                error_msg = str(e)
                exc_type = type(e).__name__

                # exit/quit 命令会抛 ToolExitException，转为友好提示
                # 只匹配异常类型名，避免误匹配 error_msg 中包含 "exit" 的普通错误
                if 'ToolExit' in exc_type:
                    return {
                        "success": True,
                        "output": output + "Use close button to exit Commander.\n",
                        "error": None,
                        "command": command,
                    }

                # 如果错误消息为空，用异常类型名替代
                if not error_msg:
                    error_msg = f"{exc_type}"

                logger.warning(f"Command '{command}' failed: {exc_type}: {error_msg}")
                return {
                    "success": False,
                    "output": output,
                    "error": error_msg,
                    "command": command,
                }

    def get_commands(self, uid: Optional[str] = None) -> list[dict]:
        """获取所有可用命令及帮助信息

        Args:
            uid: 若提供且已连接，返回包含 target-specific 命令的完整列表；
                 否则返回 standard + commander 命令组。

        Returns:
            [{name, aliases, category, usage, help, extra_help}, ...]
        """
        # 优先用已存在的上下文获取完整命令集
        ctx = None
        if uid and uid in self._contexts:
            ctx = self._contexts[uid][0]
        elif uid and backend.is_connected(uid):
            result = self._get_or_create_context(uid)
            if result:
                ctx = result[0]

        if ctx is None:
            # 无可用上下文，创建一个临时的获取命令列表
            from pyocd.commands.execution_context import CommandExecutionContext
            tmp_ctx = CommandExecutionContext()
            tmp_ctx.command_set.add_command_group('commander')
            command_set = tmp_ctx.command_set
        else:
            command_set = ctx.command_set

        commands = []
        seen_names: set[str] = set()
        for name, cmd_class in command_set.commands.items():
            # 跳过别名（只保留主名，aliases 从 INFO.names 提取）
            info = cmd_class.INFO
            primary_name = info['names'][0]
            if primary_name in seen_names:
                continue
            seen_names.add(primary_name)

            commands.append({
                "name": primary_name,
                "aliases": info['names'][1:] if len(info['names']) > 1 else [],
                "category": info.get('category', ''),
                "usage": info.get('usage', ''),
                "help": info.get('help', ''),
                "extra_help": info.get('extra_help', ''),
                "requires_connection": primary_name not in OFFLINE_COMMANDS,
            })

        # 按 category 再按 name 排序
        commands.sort(key=lambda c: (c['category'], c['name']))

        # 添加自定义扩展命令（非 pyOCD 内置）
        commands.append({
            "name": "$",
            "aliases": [],
            "category": "scripts",
            "usage": "<python_expr>",
            "help": "Evaluate a Python expression (eval). Access target, session, board, probe, elf, map objects.",
            "extra_help": (
                "Evaluate a Python expression using eval(). Only single expressions are supported.\n"
                "For multi-line scripts, use 'run <script.py>' instead.\n\n"
                "Available objects:\n"
                "  target   - Target object (read/write memory, regs, breakpoints)\n"
                "  session  - Session object\n"
                "  board    - Board object\n"
                "  probe    - DebugProbe object\n"
                "  elf      - ELF file (if loaded)\n"
                "  map      - Memory map\n\n"
                "Examples:\n"
                "  $ target.read32(0x20000000)\n"
                "  $ hex(target.regs['r0'])\n"
                "  $ [r.name for r in target.cores]\n"
                "  $ target.write32(0x20000000, 0x12345678)\n"
                "  $ target.elf.filename\n"
            ),
            "requires_connection": True,
        })
        commands.append({
            "name": "!",
            "aliases": [],
            "category": "scripts",
            "usage": "<shell_command>",
            "help": "Execute a system shell command and display output.",
            "extra_help": (
                "Run a shell command using subprocess (shell=True).\n"
                "The command output is captured and displayed in the terminal.\n\n"
                "Examples:\n"
                "  ! dir\n"
                "  ! ls -la\n"
                "  ! echo hello\n"
                "  ! type firmware.hex\n"
                "  ! python --version\n"
            ),
            "requires_connection": False,
        })
        commands.append({
            "name": "run",
            "aliases": [],
            "category": "scripts",
            "usage": "<script.py>",
            "help": "Run a Python script with exec(), supports multi-line statements (for/if/def). Access target, session, board, probe, elf, map objects.",
            "extra_help": (
                "Execute a Python script file using exec() in the pyOCD session namespace.\n"
                "Unlike $ (eval, single expression only), 'run' supports full Python syntax:\n"
                "  for/if/while/try/def/class, assignments, imports, etc.\n\n"
                "Available objects in script:\n"
                "  target   - Target object (read/write memory, regs, breakpoints)\n"
                "  session  - Session object\n"
                "  board    - Board object\n"
                "  probe    - DebugProbe object\n"
                "  elf      - ELF file (if loaded)\n"
                "  map      - Memory map\n"
                "  print()  - Output to terminal\n\n"
                "Examples:\n"
                "  run my_script.py\n"
                "  run ~/debug_script.py\n\n"
                "Example script.py content:\n"
                "  # Read memory block and format output\n"
                "  base = 0x20000000\n"
                "  for offset in range(0, 0x20, 4):\n"
                "      addr = base + offset\n"
                "      val = target.read32(addr)\n"
                "      print(f'0x{addr:08X}: 0x{val:08X}')\n"
                "  # Write memory\n"
                "  target.write32(0x20000000, 0xDEADBEEF)\n"
                "  # Read register\n"
                "  print(f'R0 = 0x{target.regs[\"r0\"]:08X}')\n"
            ),
            "requires_connection": True,
        })
        commands.append({
            "name": "run_batch",
            "aliases": [],
            "category": "scripts",
            "usage": "<commands.txt>",
            "help": "Execute Commander commands from a text file, one command per line. Like 'pyocd commander -x'.",
            "extra_help": (
                "Read a text file and execute each line as a Commander REPL command.\n"
                "Lines starting with # are comments and are skipped. Empty lines are skipped.\n\n"
                "Equivalent to 'pyocd commander -x commands.txt' on the command line.\n\n"
                "Examples:\n"
                "  run_batch commands.txt\n"
                "  run_batch ~/debug_sequence.txt\n\n"
                "Example commands.txt content:\n"
                "  # Halt target and read registers\n"
                "  halt\n"
                "  reg\n"
                "  # Read memory block\n"
                "  read32 0x20000000 16\n"
                "  # Set breakpoint and run\n"
                "  break 0x08000100\n"
                "  continue\n"
                "  # Check status\n"
                "  status\n"
                "  where\n"
            ),
            "requires_connection": True,
        })

        # 重新排序
        commands.sort(key=lambda c: (c['category'], c['name']))
        return commands

    def reset_context(self, uid: str) -> bool:
        """重置探针的命令上下文（目标切换/重连后调用）

        下次执行命令时会自动重建上下文。
        """
        self._cleanup_context(uid)
        logger.info(f"Commander context reset for probe {uid[:16]}")
        return True

    def cleanup_all(self):
        """清理所有上下文（应用退出时调用）"""
        self._contexts.clear()


# 全局单例
commander_backend = CommanderBackend()
