列计划，解决以下问题
1. 打包为安装包时，将开发环境的数据库作为应用的初始数据库，当应用第一次启动时，自动将初始数据库导入到应用的数据库中。
2. 完善项目README文档，将各页面用到的技术、依赖关系、设计思路、注意事项等写入文档中
3. Flash 页
- Fill Memory 功能，是指在某个地址范围内容，向数据tab中填充数据，然后由用户觉得是否program到目标设备。 Fill Memory 功能只操作tab的数据
4. Commander 页
- elf 加 step 调试还是有问题，用之前的方法，如果编译是在本机是可以显示c代码的。现在都只是显示汇编代码，加c的文件名。我已经连接了jlink + apm32f407ig，你可以直接测试
pyocd> load D:/workspace/embedded/stm32-workspace/examples/dsp/dsp_wave/Objects/stm32f407/omni.axf 
[---|---|---|---|---|---|---|---|---|----]
[========================================]
[---|---|---|---|---|---|---|---|---|----]
[========================================]
pyocd> 
reset -h
Resetting target with halt
Successfully halted device on reset
pyocd> elf D:/workspace/embedded/stm32-workspace/examples/dsp/dsp_wave/Objects/stm32f407/omni.axf
Loaded ELF: omni.axf
Tip: if 'step' does not show C source, use 'source PATH' to add source directories, or 'source substitute FROM TO' to remap the build path.
pyocd> 
step
0x0800019e:* 8047      blx     r0                      startup_stm32f407xx.s:175
pyocd> 
step
0x080013f0:* 4ef68851  movw    r1, #0xed88             system_stm32f4xx.c:168
pyocd> 
step
0x080013f4:* cef20001  movt    r1, #0xe000             system_stm32f4xx.c:168
pyocd> 
step
0x080013f8:* 0868      ldr     r0, [r1]                system_stm32f4xx.c:171
pyocd> 
step
0x080013fa:* 40f47000  orr     r0, r0, #0xf00000       system_stm32f4xx.c:171
pyocd> 
step
0x080013fe:* 0860      str     r0, [r1]                system_stm32f4xx.c:171
pyocd> 
step
0x08001400:* 7047      bx      lr                      system_stm32f4xx.c:182
pyocd> 
step
0x080001a0:* 0648      ldr     r0, [pc, #0x18]         startup_stm32f407xx.s:176
pyocd> 
step
0x080001a2:* 0047      bx      r0                      startup_stm32f407xx.s:177
pyocd> 
step
0x08000188:* dff80cd0  ldr.w   sp, [pc, #0xc]        
pyocd> source D:/workspace/embedded/stm32-workspace/examples/dsp/dsp_wave/Objects/stm32f407/omni.axf
Warning: 'D:\workspace\embedded\stm32-workspace\examples\dsp\dsp_wave\Objects\stm32f407\omni.axf' is not an existing directory
Added source directory: D:\workspace\embedded\stm32-workspace\examples\dsp\dsp_wave\Objects\stm32f407\omni.axf
pyocd> source D:/workspace/embedded/stm32-workspace/examples/dsp/dsp_wave/Objects/stm32f407/
Added source directory: D:\workspace\embedded\stm32-workspace\examples\dsp\dsp_wave\Objects\stm32f407
pyocd> step
0x0800018c:* 00f07af8  bl      #0x8000284            
pyocd> step
0x08000284:* 1cb5      push    {r2, r3, r4, lr}      
pyocd> step
0x08000286:* 0948      ldr     r0, [pc, #0x24]       
pyocd> step
0x08000288:* 0090      str     r0, [sp]              
pyocd> step
0x0800028a:* 0948      ldr     r0, [pc, #0x24]       
pyocd> step
0x0800028c:* 0190      str     r0, [sp, #4]          
pyocd> step
0x0800028e:* 0546      mov     r5, r0