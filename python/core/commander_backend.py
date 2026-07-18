"""Commander 命令执行后端

封装 pyOCD 的 CommandExecutionContext，为每个已连接探针维护一个命令执行上下文，
支持通过 REST API 同步执行 Commander REPL 命令并捕获输出。

复用 pyOCD 全部 49 个内置命令（reg/read32/write32/break/step/halt/disasm 等），
无需自研命令解析。
"""

import io
import threading
import logging
from typing import Optional

from core.pyocd_backend import backend
from core.events import event_manager

logger = logging.getLogger(__name__)


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

    def _cleanup_context(self, uid: str):
        """清理探针的命令上下文"""
        self._contexts.pop(uid, None)

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
            # 清空输出缓冲
            buf.seek(0)
            buf.truncate(0)

            try:
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

                # exit/quit 命令会抛 ToolExitException，转为友好提示
                if 'ToolExit' in type(e).__name__ or 'exit' in error_msg.lower():
                    return {
                        "success": True,
                        "output": output + "Use close button to exit Commander.\n",
                        "error": None,
                        "command": command,
                    }

                logger.warning(f"Command '{command}' failed: {e}")
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
            })

        # 按 category 再按 name 排序
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
