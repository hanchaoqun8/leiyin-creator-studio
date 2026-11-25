# -*- coding: utf-8 -*-
"""云端入口：部署沙箱默认执行 python main.py，这里转交真正的服务 server.py。
server.py 已监听 PORT 环境变量并绑定 0.0.0.0。"""
import runpy
from pathlib import Path

runpy.run_path(str(Path(__file__).resolve().parent / "server.py"), run_name="__main__")
