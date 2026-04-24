@echo off
cd /d "%~dp0"
codex.cmd --dangerously-bypass-approvals-and-sandbox -C "%~dp0"
