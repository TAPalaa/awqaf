"""
تطبيق سطح المكتب لمنصة إدارة برامج الثانويات الشرعية — وزارة الأوقاف
يعتمد على pywebview + محرك Edge WebView2 مع حفظ دائم للـ Cookies والـ Cache.
"""
import os
import sys
import threading
import functools
from http.server import HTTPServer, SimpleHTTPRequestHandler
import webview

# إذا قمت بنشر الموقع على GitHub Pages يمكنك وضع الرابط هنا ليفتح النسخة الحية دائماً،
# أو اتركه فارغاً ليفتح ملفات www المدمجة داخل التطبيق تلقائياً عبر خادم محلي آمن.
LIVE_WEB_URL = ""

APP_TITLE = "منصة برامج الثانويات الشرعية — وزارة الأوقاف"


def get_storage_dir() -> str:
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    path = os.path.join(base, "AwqafShariaPlatform", "webview_profile")
    os.makedirs(path, exist_ok=True)
    return path


def get_www_dir() -> str:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        candidate = os.path.join(sys._MEIPASS, "www")
        if os.path.isdir(candidate):
            return candidate
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(here, "..", "www"))


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def start_local_server(directory: str) -> str:
    handler = functools.partial(QuietHandler, directory=directory)
    server = HTTPServer(("127.0.0.1", 0), handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return f"http://127.0.0.1:{port}/index.html"


def main():
    if LIVE_WEB_URL.strip():
        target_url = LIVE_WEB_URL.strip()
    else:
        www_dir = get_www_dir()
        target_url = start_local_server(www_dir)

    storage_path = get_storage_dir()

    webview.create_window(
        title=APP_TITLE,
        url=target_url,
        width=1280,
        height=820,
        min_size=(900, 620),
        text_select=True,
    )

    # private_mode=False + storage_path تضمن بقاء الـ Cookies وتسجيل الدخول محفوظاً مدى الحياة
    webview.start(
        gui="edgechromium",
        private_mode=False,
        storage_path=storage_path,
    )


if __name__ == "__main__":
    main()
