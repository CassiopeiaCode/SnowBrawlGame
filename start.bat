@echo off
REM Windows 启动脚本

REM 设置端口
set PORT=48230

echo [start] PORT=%PORT%
echo [start] starting deno server...

REM 启动服务器
deno run -A --unstable-kv main.ts

pause
