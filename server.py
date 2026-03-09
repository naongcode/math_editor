from http.server import HTTPServer, BaseHTTPRequestHandler
import json, os

DATA_FILE = 'data.json'

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # 로그 출력 끄기

    def send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/data':
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, encoding='utf-8') as f:
                    data = json.load(f)
            else:
                data = {'students': [], 'problemSets': []}
            self.send_json(200, data)

    def do_POST(self):
        if self.path == '/api/data':
            length = int(self.headers['Content-Length'])
            body = json.loads(self.rfile.read(length).decode('utf-8'))
            with open(DATA_FILE, 'w', encoding='utf-8') as f:
                json.dump(body, f, ensure_ascii=False, indent=2)
            self.send_json(200, {'ok': True})

if __name__ == '__main__':
    print('서버 실행 중: http://localhost:8000')
    HTTPServer(('', 8000), Handler).serve_forever()
