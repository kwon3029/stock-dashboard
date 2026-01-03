from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import matplotlib
matplotlib.use('Agg')  # GUI 백엔드 없이 사용
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import matplotlib.font_manager as fm
from datetime import datetime, timedelta
import io
import base64
import requests
import json
import platform
import os

import requests
from bs4 import BeautifulSoup

def get_naver_news(stock_code):
    """Naver 모바일 뉴스 API에서 최대 5개의 뉴스 아이템을 반환합니다.
    기본 응답에 5개 미만의 아이템이 있을 경우, 추가로 페이지 파라미터를 사용해 더 긁어옵니다.
    """
    if not stock_code:
        return []

    stock_code = stock_code.replace('.KS', '').replace('.KQ', '')
    base_url = f"https://m.stock.naver.com/api/news/stock/{stock_code}"
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
    }

    news_list = []
    seen = set()

    # try multiple pages until we have up to 5 unique items (page=1 is default)
    for page in range(1, 6):
        try:
            url = base_url if page == 1 else f"{base_url}?page={page}"
            res = requests.get(url, headers=headers, timeout=10)
            data = res.json()
        except Exception as e:
            print("Naver 뉴스 요청/파싱 실패:", e)
            break

        if not isinstance(data, list) or len(data) == 0:
            break

        items = data[0].get("items", [])
        if not items:
            # no more items
            break

        for item in items:
            article_id = item.get("articleId")
            office_id = item.get("officeId")

            # skip duplicates using article id
            key = f"{office_id}:{article_id}"
            if article_id is None or key in seen:
                continue
            seen.add(key)

            news_url = None
            if office_id and article_id:
                news_url = f"https://n.news.naver.com/article/{office_id}/{article_id}"

            news_list.append({
                "title": item.get("title"),
                "summary": item.get("body", "")[:150],
                "url": news_url,
                "press": item.get("officeName"),
                "date": item.get("datetime")
            })

            if len(news_list) >= 5:
                break

        if len(news_list) >= 5:
            break

    # 마지막으로 정렬(최신순이 보장되지 않을 경우) — date가 문자열 'YYYYMMDDHHMM' 형태라고 가정
    try:
        news_list.sort(key=lambda x: x.get('date') or '', reverse=True)
    except Exception:
        pass

    return news_list[:5]


def get_naver_discussion(stock_code):
    url = f"https://m.stock.naver.com/domestic/stock/{stock_code}/discussion"
    headers = {"User-Agent": "Mozilla/5.0"}

    res = requests.get(url, headers=headers)
    soup = BeautifulSoup(res.text, "html.parser")

    posts = []

    for item in soup.select("li.DiscussionList_item__"):
        title = item.select_one("strong").get_text(strip=True)
        link = item.find("a")["href"]
        info = item.select_one("span")

        posts.append({
            "title": title,
            "info": info.get_text(strip=True) if info else "",
            "url": "https://m.stock.naver.com" + link
        })

    return posts

# 한글 폰트 설정
def setup_korean_font():
    """한글 폰트 설정"""
    system = platform.system()
    
    if system == 'Windows':
        # Windows에서 사용 가능한 한글 폰트 (여러 이름 시도)
        font_candidates = [
            ('Malgun Gothic', None),
            ('맑은 고딕', None),
            ('NanumGothic', None),
            ('나눔고딕', None),
            ('Gulim', None),
            ('굴림', None),
            ('Batang', None),
            ('바탕', None),
        ]
        
        # Windows 폰트 경로 직접 지정 시도
        import os
        font_paths = [
            os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts', 'malgun.ttf'),
            os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts', 'gulim.ttc'),
        ]
        
        # 경로로 폰트 찾기
        for font_path in font_paths:
            if os.path.exists(font_path):
                try:
                    font_prop = fm.FontProperties(fname=font_path)
                    plt.rcParams['font.family'] = font_prop.get_name()
                    plt.rcParams['axes.unicode_minus'] = False
                    print(f"한글 폰트 설정 완료 (경로): {font_path}")
                    return font_path
                except:
                    continue
        
    elif system == 'Darwin':  # macOS
        font_candidates = [
            ('AppleGothic', None),
            ('NanumGothic', None),
        ]
    else:  # Linux
        font_candidates = [
            ('NanumGothic', None),
            ('NanumBarunGothic', None),
            ('DejaVu Sans', None),
        ]
    
    # 사용 가능한 폰트 찾기
    available_fonts = {f.name: f for f in fm.fontManager.ttflist}
    
    for font_name, _ in font_candidates:
        # 정확한 이름 매칭
        if font_name in available_fonts:
            plt.rcParams['font.family'] = font_name
            plt.rcParams['axes.unicode_minus'] = False
            print(f"한글 폰트 설정 완료: {font_name}")
            return font_name
        
        # 부분 매칭 시도
        for available_name in available_fonts.keys():
            if font_name.lower() in available_name.lower() or available_name.lower() in font_name.lower():
                plt.rcParams['font.family'] = available_name
                plt.rcParams['axes.unicode_minus'] = False
                print(f"한글 폰트 설정 완료 (부분 매칭): {available_name}")
                return available_name
    
    # 폰트를 찾지 못한 경우 기본 설정
    plt.rcParams['axes.unicode_minus'] = False
    print("경고: 한글 폰트를 찾을 수 없습니다. 한글이 깨질 수 있습니다.")
    print("사용 가능한 폰트 목록:")
    for font in list(available_fonts.keys())[:10]:
        print(f"  - {font}")
    return None

# 폰트 설정 실행
setup_korean_font()

# 정적 파일을 Flask에서 제공 (index.html, script.js, styles.css 등)
# static_folder='.' 로 설정하면 루트의 정적 파일을 그대로 서빙합니다.
app = Flask(__name__, static_folder='.', static_url_path='')
# CORS는 API 경로만 허용하도록 설정
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

# 루트는 index.html을 반환
@app.route('/')
def index():
    return app.send_static_file('index.html')

# 모든 API 응답에 대해 Origin을 반영한 CORS 헤더를 추가합니다.
@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin')
    if origin and request.path.startswith('/api/'):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Vary'] = 'Origin'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
        response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    return response

# Yahoo Finance API 프록시
PROXY_OPTIONS = [
    'https://api.allorigins.win/get?url=',
    'https://corsproxy.io/?',
]

def fetch_stock_data(symbol):
    """Yahoo Finance에서 주식 데이터 가져오기"""
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1mo'
    
    for proxy in PROXY_OPTIONS:
        try:
            if 'allorigins' in proxy:
                proxy_url = proxy + requests.utils.quote(url)
            else:
                proxy_url = proxy + url
            
            response = requests.get(proxy_url, timeout=10)
            data = response.json()
            
            if 'allorigins' in proxy and 'contents' in data:
                data = json.loads(data['contents'])
            
            result = data.get('chart', {}).get('result', [])
            if result:
                quotes = result[0].get('indicators', {}).get('quote', [{}])[0]
                timestamps = result[0].get('timestamp', [])
                closes = quotes.get('close', [])
                
                # 유효한 데이터만 추출
                valid_data = []
                for i, ts in enumerate(timestamps):
                    if closes[i] is not None:
                        valid_data.append({
                            'timestamp': datetime.fromtimestamp(ts),
                            'price': closes[i]
                        })
                
                return valid_data
        except Exception as e:
            print(f"프록시 시도 실패 ({proxy}): {e}")
            continue
    
    return None

@app.route('/api/stock-chart', methods=['POST'])
def generate_chart():
    """주식 차트 이미지 생성 및 반환"""
    try:
        data = request.json
        symbol = data.get('symbol')
        name = data.get('name', '주식')
        
        if not symbol:
            return jsonify({'error': '심볼이 필요합니다'}), 400
        
        # 주식 데이터 가져오기
        stock_data = fetch_stock_data(symbol)
        
        if not stock_data or len(stock_data) < 2:
            return jsonify({'error': '데이터를 가져올 수 없습니다'}), 404
        
        # 데이터 준비
        dates = [d['timestamp'] for d in stock_data]
        prices = [d['price'] for d in stock_data]
        
        # 그래프 생성
        plt.figure(figsize=(12, 6))
        plt.plot(dates, prices, linewidth=2.5, color='#e74c3c' if prices[-1] >= prices[0] else '#3498db')
        plt.fill_between(dates, prices, alpha=0.3, color='#e74c3c' if prices[-1] >= prices[0] else '#3498db')
        
        plt.title(f'{name} 주가 차트', fontsize=16, fontweight='bold', pad=20)
        plt.xlabel('날짜', fontsize=12)
        plt.ylabel('가격 (원)', fontsize=12)
        plt.grid(True, alpha=0.3)
        
        # 날짜 형식 설정
        plt.gca().xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
        plt.gca().xaxis.set_major_locator(mdates.DayLocator(interval=max(1, len(dates)//10)))
        plt.xticks(rotation=45)
        
        # 레이아웃 조정
        plt.tight_layout()
        
        # 이미지를 바이트로 변환
        img_buffer = io.BytesIO()
        plt.savefig(img_buffer, format='png', dpi=150, bbox_inches='tight')
        img_buffer.seek(0)
        plt.close()
        
        return send_file(img_buffer, mimetype='image/png', as_attachment=True, 
                        download_name=f'{name}_{symbol.replace(".", "_")}_chart.png')
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
@app.route("/api/naver/discussion")
def naver_discussion():
    code = request.args.get("code")
    return jsonify(get_naver_discussion(code))

@app.route("/api/naver/news")
def naver_news():
    code = request.args.get("code")
    if not code:
        return jsonify([])
    try:
        return jsonify(get_naver_news(code))
    except Exception as e:
        print('naver_news error:', e)
        return jsonify([])

@app.route('/api/stock-data', methods=['GET'])
def get_stock_data():
    """주식 데이터 JSON 반환"""
    try:
        symbol = request.args.get('symbol')
        if not symbol:
            return jsonify({'error': '심볼이 필요합니다'}), 400
        
        stock_data = fetch_stock_data(symbol)
        
        if not stock_data:
            return jsonify({'error': '데이터를 가져올 수 없습니다'}), 404
        
        return jsonify({
            'symbol': symbol,
            'data': [
                {
                    'date': d['timestamp'].strftime('%Y-%m-%d'),
                    'price': d['price']
                }
                for d in stock_data
            ]
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)


