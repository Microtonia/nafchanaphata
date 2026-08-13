import http.server
import mimetypes
import json
import os
from urllib.parse import urlparse

# 修复 Windows 上 .js 和 .mjs 文件的 MIME 类型
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('audio/ogg', '.ogg')
mimetypes.add_type('audio/mpeg', '.mp3')
mimetypes.add_type('font/otf', '.otf')

# 背景图片目录 // Background image directory
BACKGROUND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'background')
IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'}

class Handler(http.server.SimpleHTTPRequestHandler):
    # 直接覆盖 extensions_map，因为在 Windows 上 mimetypes 初始化不完整
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.css': 'text/css',
        '.ogg': 'audio/ogg',
        '.mp3': 'audio/mpeg',
        '.otf': 'font/otf',
    }

    def do_GET(self):
        # 处理预览环境注入的 @vite/client 请求
        path = urlparse(self.path).path
        if path == '/@vite/client':
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript')
            self.end_headers()
            self.wfile.write(b'')
            return
        # 背景图片列表接口
        if path == '/api/backgrounds':
            self._send_backgrounds()
            return
        super().do_GET()

    def _send_backgrounds(self):
        files = []
        try:
            for name in sorted(os.listdir(BACKGROUND_DIR)):
                ext = os.path.splitext(name)[1].lower()
                if ext in IMAGE_EXTS:
                    files.append(name)
        except FileNotFoundError:
            pass
        body = json.dumps(files).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

if __name__ == '__main__':
    http.server.test(Handler, port=3000)
