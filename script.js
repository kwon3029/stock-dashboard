// 주식 데이터를 가져오는 함수들
const API_CONFIG = {
    // Alpha Vantage API 키 (무료 키를 https://www.alphavantage.co/support/#api-key 에서 발급받으세요)
    ALPHA_VANTAGE_KEY: 'demo', // 'demo'는 제한된 데이터만 제공합니다. 실제 사용시 발급받은 키로 변경하세요.
    
    // Yahoo Finance API (여러 CORS 프록시 옵션)
    PROXY_OPTIONS: [
        'https://api.allorigins.win/get?url=',
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest='
    ]
};

// 추가 주식 목록 (더보기 버튼으로 표시)
const ADDITIONAL_STOCKS = [
    { symbol: '051910.KS', name: 'LG화학', code: '051910' },
    { symbol: '006400.KS', name: '삼성SDI', code: '006400' },
    { symbol: '028260.KS', name: '삼성물산', code: '028260' },
    { symbol: '096770.KS', name: 'SK이노베이션', code: '096770' },
    { symbol: '003670.KS', name: '포스코홀딩스', code: '003670' },
    { symbol: '032830.KS', name: '삼성생명', code: '032830' }
];

// 숫자 포맷팅 함수
function formatNumber(num) {
    if (!num || num === null || num === undefined || isNaN(num)) {
        return '-';
    }
    if (num >= 1000000000000) {
        return (num / 1000000000000).toFixed(2) + '조';
    } else if (num >= 1000000000) {
        return (num / 1000000000).toFixed(2) + '억';
    } else if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
}

function formatPrice(price) {
    return price.toLocaleString('ko-KR') + '원';
}

// Yahoo Finance API를 통한 주식 데이터 가져오기 (개선된 버전)
async function fetchStockDataFromYahoo(symbol) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    
    // 여러 프록시 옵션 시도
    for (const proxy of API_CONFIG.PROXY_OPTIONS) {
        try {
            let proxyUrl, response, data;
            
            if (proxy.includes('allorigins')) {
                proxyUrl = proxy + encodeURIComponent(url);
                response = await fetch(proxyUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                data = await response.json();
                
                if (data.contents) {
                    data = JSON.parse(data.contents);
                } else {
                    continue;
                }
            } else if (proxy.includes('corsproxy')) {
                proxyUrl = proxy + encodeURIComponent(url);
                response = await fetch(proxyUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                data = await response.json();
            } else {
                proxyUrl = proxy + url;
                response = await fetch(proxyUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                data = await response.json();
            }
            
            const result = data.chart?.result?.[0];
            
            if (result && result.meta) {
                const meta = result.meta;
                const regularMarketPrice = meta.regularMarketPrice || meta.currentPrice;
                const previousClose = meta.previousClose || meta.chartPreviousClose;
                
                if (regularMarketPrice && previousClose) {
                    const change = regularMarketPrice - previousClose;
                    const changePercent = (change / previousClose) * 100;
                    const volume = meta.regularMarketVolume || meta.volume24Hr || 0;
                    
                    return {
                        price: regularMarketPrice,
                        change: change,
                        changePercent: changePercent,
                        volume: volume,
                        previousClose: previousClose
                    };
                }
            }
        } catch (error) {
            console.log(`프록시 시도 실패 (${proxy}):`, error.message);
            continue;
        }
    }
    
    // 모든 프록시 실패 시 직접 시도 (CORS 오류 가능)
    try {
        const response = await fetch(url);
        const data = await response.json();
        const result = data.chart?.result?.[0];
        
        if (result && result.meta) {
            const meta = result.meta;
            const regularMarketPrice = meta.regularMarketPrice || meta.currentPrice;
            const previousClose = meta.previousClose || meta.chartPreviousClose;
            
            if (regularMarketPrice && previousClose) {
                const change = regularMarketPrice - previousClose;
                const changePercent = (change / previousClose) * 100;
                const volume = meta.regularMarketVolume || meta.volume24Hr || 0;
                
                return {
                    price: regularMarketPrice,
                    change: change,
                    changePercent: changePercent,
                    volume: volume,
                    previousClose: previousClose
                };
            }
        }
    } catch (error) {
        console.error(`Yahoo Finance 직접 요청 실패 (${symbol}):`, error);
    }
    
    return null;
}

// Alpha Vantage API를 통한 주식 데이터 가져오기
async function fetchStockDataFromAlphaVantage(symbol) {
    try {
        // 한국 주식의 경우 심볼 형식 변환 필요
        const apiSymbol = symbol.replace('.KS', '');
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${apiSymbol}&apikey=${API_CONFIG.ALPHA_VANTAGE_KEY}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data['Global Quote'] && data['Global Quote']['05. price']) {
            const quote = data['Global Quote'];
            const price = parseFloat(quote['05. price']);
            const previousClose = parseFloat(quote['08. previous close']);
            const change = price - previousClose;
            const changePercent = (change / previousClose) * 100;
            const volume = parseFloat(quote['06. volume']) || 0;
            
            return {
                price: price,
                change: change,
                changePercent: changePercent,
                volume: volume
            };
        }
        return null;
    } catch (error) {
        console.error(`Alpha Vantage API 오류 (${symbol}):`, error);
        return null;
    }
}

// Finnhub API를 통한 주식 데이터 가져오기 (무료 티어 제공)
async function fetchStockDataFromFinnhub(symbol) {
    try {
        // Finnhub는 한국 주식을 직접 지원하지 않으므로 심볼 변환 필요
        // 한국 주식의 경우 다른 방법 사용
        const apiKey = 'demo'; // 무료 키는 https://finnhub.io/ 에서 발급
        const cleanSymbol = symbol.replace('.KS', '');
        
        // 한국 주식은 Finnhub에서 제한적이므로 스킵
        if (symbol.includes('.KS')) {
            return null;
        }
        
        const url = `https://finnhub.io/api/v1/quote?symbol=${cleanSymbol}&token=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.c && data.pc) {
            const price = data.c; // 현재 가격
            const previousClose = data.pc; // 전일 종가
            const change = price - previousClose;
            const changePercent = (change / previousClose) * 100;
            const volume = data.v || 0;
            
            return {
                price: price,
                change: change,
                changePercent: changePercent,
                volume: volume
            };
        }
        return null;
    } catch (error) {
        console.error(`Finnhub API 오류 (${symbol}):`, error);
        return null;
    }
}

// 주식 데이터 가져오기 (여러 소스 시도)
async function fetchStockData(symbol) {
    // Yahoo Finance를 먼저 시도 (가장 안정적, 한국 주식 지원)
    let data = await fetchStockDataFromYahoo(symbol);
    
    // 한국 주식의 경우 Yahoo Finance가 최선이므로 재시도
    if (!data && symbol.includes('.KS')) {
        console.log(`${symbol} 재시도 중...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        data = await fetchStockDataFromYahoo(symbol);
    }
    
    // 실패하면 Finnhub 시도 (미국 주식용)
    if (!data && !symbol.includes('.KS')) {
        data = await fetchStockDataFromFinnhub(symbol);
    }
    
    // 실패하면 Alpha Vantage 시도
    if (!data) {
        data = await fetchStockDataFromAlphaVantage(symbol);
    }
    
    return data;
}

// 미니 차트 그리기 (개선된 버전 - 더 정확하고 크게)
function drawMiniChart(canvas, prices, isPositive) {
    if (!prices || prices.length === 0) return;
    
    // 캔버스 크기 설정
    const displayWidth = 300;
    const displayHeight = 100;
    const dpr = window.devicePixelRatio || 1;
    
    // 고해상도 렌더링을 위한 스케일 조정
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    const width = displayWidth;
    const height = displayHeight;
    const padding = 10;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    // 캔버스 초기화
    ctx.clearRect(0, 0, width, height);
    
    // 가격 데이터 정규화 (약간의 여유 공간 추가)
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;
    const pricePadding = priceRange * 0.05; // 5% 여유 공간 (더 정확하게)
    
    // 그래프 색상 (상승: 빨강, 하락: 파랑)
    const color = isPositive ? '#e74c3c' : '#3498db';
    
    // 그라데이션 영역 먼저 그리기 (라인 아래에)
    if (prices.length > 1) {
        ctx.beginPath();
        ctx.moveTo(padding, height - padding);
        
        prices.forEach((price, index) => {
            const x = padding + (index / (prices.length - 1 || 1)) * chartWidth;
            const y = height - padding - ((price - minPrice + pricePadding) / (priceRange + pricePadding * 2)) * chartHeight;
            ctx.lineTo(x, y);
        });
        
        ctx.lineTo(width - padding, height - padding);
        ctx.closePath();
        
        const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
        gradient.addColorStop(0, isPositive ? 'rgba(231, 76, 60, 0.25)' : 'rgba(52, 152, 219, 0.25)');
        gradient.addColorStop(1, isPositive ? 'rgba(231, 76, 60, 0.05)' : 'rgba(52, 152, 219, 0.05)');
        
        ctx.fillStyle = gradient;
        ctx.fill();
    }
    
    // 라인 그리기 (더 두껍고 부드럽게, 큰 그래프에 맞게)
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // 정확한 좌표 계산
    const points = prices.map((price, index) => {
        const x = padding + (index / (prices.length - 1 || 1)) * chartWidth;
        const y = height - padding - ((price - minPrice + pricePadding) / (priceRange + pricePadding * 2)) * chartHeight;
        return { x, y };
    });
    
    if (points.length === 1) {
        // 데이터가 하나만 있을 때
        ctx.arc(points[0].x, points[0].y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    } else {
        // 첫 번째 점으로 이동
        ctx.moveTo(points[0].x, points[0].y);
        
        // 부드러운 곡선 그리기
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            
            if (i === 1) {
                // 첫 번째 선분은 직선
                ctx.lineTo(curr.x, curr.y);
            } else {
                // 이후 선분은 이전 점과의 중간점을 제어점으로 사용
                const prevPrev = points[i - 2];
                const cpX = prev.x;
                const cpY = prev.y;
                ctx.quadraticCurveTo(cpX, cpY, curr.x, curr.y);
            }
        }
        
        ctx.stroke();
        
        // 마지막 점에 원 그리기 (현재 가격 표시 - 더 크게)
        const lastPoint = points[points.length - 1];
        ctx.beginPath();
        ctx.arc(lastPoint.x, lastPoint.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        
        // 첫 번째 점에도 원 (시작점 표시)
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

// 주식 가격 히스토리 가져오기 (개선된 버전 - 더 많은 데이터)
async function fetchStockHistory(symbol) {
    // 1개월 데이터 가져오기 (더 정확한 그래프를 위해)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`;
    
    for (const proxy of API_CONFIG.PROXY_OPTIONS) {
        try {
            let proxyUrl, response, data;
            
            if (proxy.includes('allorigins')) {
                proxyUrl = proxy + encodeURIComponent(url);
                response = await fetch(proxyUrl);
                data = await response.json();
                
                if (data.contents) {
                    data = JSON.parse(data.contents);
                } else {
                    continue;
                }
            } else if (proxy.includes('corsproxy')) {
                proxyUrl = proxy + encodeURIComponent(url);
                response = await fetch(proxyUrl);
                data = await response.json();
            } else {
                proxyUrl = proxy + url;
                response = await fetch(proxyUrl);
                data = await response.json();
            }
            
            const result = data.chart?.result?.[0];
            if (result && result.indicators && result.indicators.quote) {
                const quotes = result.indicators.quote[0];
                const timestamps = result.timestamp;
                const closes = quotes.close;
                
                // 타임스탬프와 가격을 매칭하여 유효한 데이터만 추출
                const validData = [];
                for (let i = 0; i < timestamps.length; i++) {
                    if (closes[i] !== null && closes[i] !== undefined) {
                        validData.push({
                            timestamp: timestamps[i],
                            price: closes[i]
                        });
                    }
                }
                
                // 최근 30개 데이터 포인트 사용 (더 정확한 그래프를 위해)
                const recentData = validData.slice(-30);
                const prices = recentData.map(d => d.price);
                
                if (prices.length > 0) {
                    return prices;
                }
            }
        } catch (error) {
            console.log(`히스토리 데이터 가져오기 실패 (${symbol}):`, error.message);
            continue;
        }
    }
    return null;
}

// 주식 카드 업데이트
async function updateStockCard(card, data) {
    const priceElement = card.querySelector('.current-price');
    const changeElement = card.querySelector('.price-change');
    const volumeElement = card.querySelector('.volume');
    const chartCanvas = card.querySelector('.mini-chart');
    
    if (!data || !data.price) {
        priceElement.textContent = '데이터 없음';
        changeElement.textContent = '-';
        changeElement.className = 'price-change';
        if (volumeElement) volumeElement.textContent = '-';
        return;
    }
    
    // 가격 업데이트
    priceElement.textContent = formatPrice(data.price);
    
    // 변동률 업데이트 (데이터 확인)
    const isPositive = data.change >= 0;
    if (data.change !== undefined && data.changePercent !== undefined) {
        const changeText = `${data.change >= 0 ? '+' : ''}${data.change.toFixed(0)} (${data.changePercent >= 0 ? '+' : ''}${data.changePercent.toFixed(2)}%)`;
        changeElement.textContent = changeText;
        changeElement.className = 'price-change ' + (isPositive ? 'positive' : 'negative');
    } else {
        changeElement.textContent = '변동률 없음';
        changeElement.className = 'price-change';
    }
    
    // 거래량 업데이트
    if (volumeElement) {
        if (data.volume && data.volume > 0) {
            volumeElement.textContent = formatNumber(data.volume);
        } else {
            volumeElement.textContent = '-';
        }
    }
    
    // 미니 차트 그리기
    if (chartCanvas) {
        const symbol = card.getAttribute('data-symbol');
        const name = card.getAttribute('data-name');
        let prices = await fetchStockHistory(symbol);
        
        if (prices && prices.length > 0) {
            // 최소 3개 이상의 데이터 포인트가 있어야 그래프 그리기
            if (prices.length >= 3) {
                drawMiniChart(chartCanvas, prices, isPositive);
                // 그래프 더블클릭 이벤트 추가
                setupChartDoubleClick(chartCanvas, symbol, name, prices, isPositive);
            } else {
                // 데이터가 부족하면 현재 가격과 전일 종가로 보완
                const currentPrice = data.price;
                const previousClose = data.previousClose || currentPrice;
                const extendedPrices = [
                    ...prices,
                    currentPrice * 0.998,
                    currentPrice * 0.999,
                    currentPrice
                ];
                drawMiniChart(chartCanvas, extendedPrices, isPositive);
                setupChartDoubleClick(chartCanvas, symbol, name, extendedPrices, isPositive);
            }
        } else {
            // 데이터가 없으면 현재 가격과 전일 종가로 간단한 그래프 생성
            const currentPrice = data.price;
            const previousClose = data.previousClose || currentPrice;
            const mockPrices = [
                previousClose * 0.98,
                previousClose * 0.99,
                previousClose,
                currentPrice * 0.995,
                currentPrice
            ];
            drawMiniChart(chartCanvas, mockPrices, isPositive);
            setupChartDoubleClick(chartCanvas, symbol, name, mockPrices, isPositive);
        }
    }
}

// 지수 데이터 가져오기
async function fetchIndexData(indexSymbol) {
    const symbolMap = {
        'KOSPI': '^KS11',
        'KOSDAQ': '^KQ11',
        'DJI': '^DJI'
    };
    
    const symbol = symbolMap[indexSymbol];
    if (!symbol) return null;
    
    return await fetchStockDataFromYahoo(symbol);
}

// 지수 카드 업데이트
function updateIndexCard(card, data) {
    if (!data) {
        card.querySelector('.price').textContent = '데이터 없음';
        return;
    }
    
    const priceElement = card.querySelector('.price');
    const changeElement = card.querySelector('.change');
    
    priceElement.textContent = data.price.toFixed(2);
    
    const changeText = `${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)} (${data.changePercent >= 0 ? '+' : ''}${data.changePercent.toFixed(2)}%)`;
    changeElement.textContent = changeText;
    changeElement.className = 'change ' + (data.change >= 0 ? 'positive' : 'negative');
}

// 한 달 전 가격 가져오기
async function getOneMonthAgoPrice(symbol) {
    const prices = await fetchStockHistory(symbol);
    if (prices && prices.length > 0) {
        // 첫 번째 가격이 한 달 전 가격
        return prices[0];
    }
    return null;
}

// 한 달간 최고 상승주 계산 및 표시
async function updateTopGainers() {
    const stockCards = document.querySelectorAll('.stock-card[data-symbol]');
    const gainersData = [];
    
    for (const card of stockCards) {
        const symbol = card.getAttribute('data-symbol');
        const name = card.getAttribute('data-name');
        const stockCode = symbol.replace('.KS', '').replace('.KQ', '');
        
        // 현재 가격 가져오기
        const currentData = await fetchStockData(symbol);
        if (!currentData || !currentData.price || !name || !stockCode) {
            console.log(`데이터 없음: ${name} (${symbol})`);
            continue;
        }
        
        // 한 달 전 가격 가져오기
        const oneMonthAgoPrice = await getOneMonthAgoPrice(symbol);
        
        if (oneMonthAgoPrice && oneMonthAgoPrice > 0 && currentData.price > 0) {
            const currentPrice = currentData.price;
            const change = currentPrice - oneMonthAgoPrice;
            const changePercent = (change / oneMonthAgoPrice) * 100;
            const volume = (currentData.volume && currentData.volume > 0) ? currentData.volume : null;
            
            gainersData.push({
                name: name,
                code: stockCode,
                symbol: symbol,
                currentPrice: currentPrice,
                oneMonthAgoPrice: oneMonthAgoPrice,
                change: change,
                changePercent: changePercent,
                volume: volume
            });
        } else {
            console.log(`한 달 전 가격 없음: ${name} (${symbol})`);
        }
        
        // API 제한을 피하기 위해 약간의 지연
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // 변동률 기준으로 정렬 (내림차순)
    gainersData.sort((a, b) => b.changePercent - a.changePercent);
    
    // 상위 3개만 표시
    const topGainers = gainersData.slice(0, 3);
    
    // UI 업데이트
    const gainersList = document.getElementById('gainersList');
    if (topGainers.length === 0) {
        gainersList.innerHTML = '<p>데이터를 가져올 수 없습니다.</p>';
        return;
    }
    
    gainersList.innerHTML = topGainers.map((stock, index) => {
        // null 체크 및 기본값 설정
        if (!stock || !stock.name || !stock.code || !stock.symbol) {
            return '';
        }
        
        const name = stock.name || '알 수 없음';
        const code = stock.code || '-';
        const symbol = stock.symbol || '';
        const currentPrice = stock.currentPrice || 0;
        const changePercent = stock.changePercent || 0;
        const volume = (stock.volume && stock.volume > 0) ? stock.volume : null;
        
        return `
        <div class="stock-card" data-symbol="${symbol}" data-code="${code}">
            <div class="stock-header">
                <h3>${name} <span style="font-size: 0.8em; color: #e74c3c; font-weight: 600;">${index + 1}위</span></h3>
                <span class="stock-code">${code}</span>
            </div>
            <div class="stock-price">
                <div class="price-info">
                    <span class="current-price">${currentPrice > 0 ? formatPrice(currentPrice) : '데이터 없음'}</span>
                    <span class="price-change positive">+${changePercent.toFixed(2)}%</span>
                </div>
                <div class="stock-info">
                    <div class="info-item">
                        <span class="label">거래량</span>
                        <span class="value volume">${volume ? formatNumber(volume) : '-'}</span>
                    </div>
                </div>
            </div>
            <div class="chart-container">
                <canvas class="mini-chart" width="300" height="100"></canvas>
            </div>
        </div>
        `;
    }).filter(html => html !== '').join('');
    
    // 각 상승주에 그래프 그리기 및 더블클릭 이벤트 추가
    topGainers.forEach((stock, index) => {
        if (!stock || !stock.symbol || !stock.code) return;
        
        const gainerCard = document.querySelector(`.gainers-list .stock-card[data-symbol="${stock.symbol}"]`);
        if (gainerCard) {
            const chartCanvas = gainerCard.querySelector('.mini-chart');
            
            // 그래프 그리기
            if (chartCanvas) {
                fetchStockHistory(stock.symbol).then(prices => {
                    if (prices && prices.length >= 3) {
                        drawMiniChart(chartCanvas, prices, true);
                        setupChartDoubleClick(chartCanvas, stock.symbol, stock.name, prices, true);
                    } else if (stock.oneMonthAgoPrice && stock.currentPrice) {
                        // 데이터가 부족하면 간단한 그래프 생성
                        const mockPrices = [
                            stock.oneMonthAgoPrice * 0.98,
                            stock.oneMonthAgoPrice * 0.99,
                            stock.oneMonthAgoPrice,
                            stock.currentPrice * 0.995,
                            stock.currentPrice
                        ];
                        drawMiniChart(chartCanvas, mockPrices, true);
                        setupChartDoubleClick(chartCanvas, stock.symbol, stock.name, mockPrices, true);
                    }
                }).catch(error => {
                    console.error(`그래프 그리기 실패 (${stock.symbol}):`, error);
                });
            }
            
            // 더블클릭 이벤트 추가 (이미 stock-card에 cursor: pointer가 설정되어 있음)
            gainerCard.addEventListener('dblclick', () => {
                window.open(`https://finance.naver.com/item/main.naver?code=${stock.code}`, '_blank');
            });
        }
    });
}

// 모든 주식 데이터 업데이트
async function updateAllStocks() {
    console.log('주식 데이터 업데이트 시작...');
    
    // 주식 카드 업데이트
    const stockCards = document.querySelectorAll('.stock-card[data-symbol]');
    
    for (const card of stockCards) {
        const symbol = card.getAttribute('data-symbol');
        const name = card.getAttribute('data-name');
        console.log(`${name} (${symbol}) 데이터 가져오는 중...`);
        
        const data = await fetchStockData(symbol);
        console.log(`${name} 데이터:`, data);
        await updateStockCard(card, data);
        
        // API 제한을 피하기 위해 약간의 지연
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 지수 카드 업데이트
    const indexCards = document.querySelectorAll('.summary-card[data-index]');
    
    for (const card of indexCards) {
        const index = card.getAttribute('data-index');
        console.log(`${index} 지수 데이터 가져오는 중...`);
        
        const data = await fetchIndexData(index);
        console.log(`${index} 데이터:`, data);
        updateIndexCard(card, data);
        
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 한 달간 최고 상승주 업데이트
    await updateTopGainers();
    
    // 마지막 업데이트 시간 표시
    const now = new Date();
    document.getElementById('lastUpdate').textContent = now.toLocaleString('ko-KR');
    console.log('주식 데이터 업데이트 완료');
}

// 주식 카드 생성 함수
function createStockCard(stock) {
    return `
        <div class="stock-card" data-symbol="${stock.symbol}" data-name="${stock.name}">
            <div class="stock-header">
                <h3>${stock.name}</h3>
                <span class="stock-code">${stock.code}</span>
            </div>
            <div class="stock-price">
                <div class="price-info">
                    <span class="current-price">로딩 중...</span>
                    <span class="price-change">-</span>
                </div>
                <div class="stock-info">
                    <div class="info-item">
                        <span class="label">거래량</span>
                        <span class="value volume">-</span>
                    </div>
                </div>
            </div>
            <div class="chart-container">
                <canvas class="mini-chart" width="300" height="100"></canvas>
            </div>
        </div>
    `;
}

// 추가 주식 로드
async function loadMoreStocks() {
    const stockGrid = document.querySelector('.stock-grid');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const hideMoreBtn = document.getElementById('hideMoreBtn');
    
    if (!stockGrid || !loadMoreBtn) return;
    
    // 버튼 비활성화
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = '로딩 중...';
    
    // 추가 주식 카드 생성
    ADDITIONAL_STOCKS.forEach(stock => {
        const cardHTML = createStockCard(stock);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHTML;
        const card = tempDiv.firstElementChild;
        card.setAttribute('data-additional', 'true');
        stockGrid.appendChild(card);
    });
    
    // 새로 추가된 카드에 이벤트 핸들러 추가 및 데이터 로드
    const newCards = Array.from(document.querySelectorAll('.stock-card[data-additional="true"]')).filter(card => !card.hasAttribute('data-initialized'));
    
    for (const card of newCards) {
        card.setAttribute('data-initialized', 'true');
        setupStockCardClick(card);
        
        // 데이터 가져오기
        const symbol = card.getAttribute('data-symbol');
        const name = card.getAttribute('data-name');
        
        const data = await fetchStockData(symbol);
        await updateStockCard(card, data);
        
        // API 제한을 피하기 위해 약간의 지연
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 버튼 전환
    loadMoreBtn.style.display = 'none';
    if (hideMoreBtn) {
        hideMoreBtn.style.display = 'inline-block';
    }
}

// 추가 주식 숨기기
function hideMoreStocks() {
    const stockGrid = document.querySelector('.stock-grid');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const hideMoreBtn = document.getElementById('hideMoreBtn');
    
    if (!stockGrid) return;
    
    // 추가된 주식 카드 제거
    const additionalCards = stockGrid.querySelectorAll('.stock-card[data-additional="true"]');
    additionalCards.forEach(card => card.remove());
    
    // 버튼 전환
    if (hideMoreBtn) {
        hideMoreBtn.style.display = 'none';
    }
    if (loadMoreBtn) {
        loadMoreBtn.style.display = 'inline-block';
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = '더보기';
    }
}

// 주식 카드 더블클릭 이벤트 설정
function setupStockCardClick(card) {
    card.addEventListener('dblclick', () => {
        const symbol = card.getAttribute('data-symbol');
        const stockCode = symbol.replace('.KS', '').replace('.KQ', '');
        window.open(`https://finance.naver.com/item/main.naver?code=${stockCode}`, '_blank');
    });
    card.style.cursor = 'pointer';
}

// 주식 카드 더블클릭 시 네이버 주식 페이지로 이동
function setupStockCardClickHandlers() {
    const stockCards = document.querySelectorAll('.stock-card[data-symbol]');
    
    stockCards.forEach(card => {
        setupStockCardClick(card);
    });
}

// 그래프 더블클릭 이벤트 설정
function setupChartDoubleClick(canvas, symbol, name, prices, isPositive) {
    canvas.style.cursor = 'pointer';
    canvas.addEventListener('dblclick', (e) => {
        e.stopPropagation(); // 이벤트 전파 중지
        openChartModal(symbol, name, prices, isPositive);
    });
}

// 큰 그래프 그리기 (모달용)
function drawLargeChart(canvas, prices, isPositive) {
    if (!prices || prices.length === 0) return;
    
    const displayWidth = 800;
    const displayHeight = 400;
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    const width = displayWidth;
    const height = displayHeight;
    const leftPadding = 80; // Y축 레이블을 위한 여유 공간
    const rightPadding = 40;
    const topPadding = 20;
    const bottomPadding = 40;
    const chartWidth = width - leftPadding - rightPadding;
    const chartHeight = height - topPadding - bottomPadding;
    
    ctx.clearRect(0, 0, width, height);
    
    // 배경
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // 가격 데이터 정규화
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;
    const pricePadding = priceRange * 0.05;
    
    const color = isPositive ? '#e74c3c' : '#3498db';
    
    // 그리드 라인 그리기
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = topPadding + (i / 5) * chartHeight;
        ctx.beginPath();
        ctx.moveTo(leftPadding, y);
        ctx.lineTo(width - rightPadding, y);
        ctx.stroke();
        
        // Y축 레이블
        const price = maxPrice - (i / 5) * priceRange;
        ctx.fillStyle = '#666';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(formatPrice(price), leftPadding - 15, y + 4);
    }
    
    // 그라데이션 영역
    if (prices.length > 1) {
        ctx.beginPath();
        ctx.moveTo(leftPadding, height - bottomPadding);
        
        prices.forEach((price, index) => {
            const x = leftPadding + (index / (prices.length - 1 || 1)) * chartWidth;
            const y = height - bottomPadding - ((price - minPrice + pricePadding) / (priceRange + pricePadding * 2)) * chartHeight;
            ctx.lineTo(x, y);
        });
        
        ctx.lineTo(width - rightPadding, height - bottomPadding);
        ctx.closePath();
        
        const gradient = ctx.createLinearGradient(0, topPadding, 0, height - bottomPadding);
        gradient.addColorStop(0, isPositive ? 'rgba(231, 76, 60, 0.3)' : 'rgba(52, 152, 219, 0.3)');
        gradient.addColorStop(1, isPositive ? 'rgba(231, 76, 60, 0.05)' : 'rgba(52, 152, 219, 0.05)');
        ctx.fillStyle = gradient;
        ctx.fill();
    }
    
    // 라인 그리기
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const points = prices.map((price, index) => {
        const x = leftPadding + (index / (prices.length - 1 || 1)) * chartWidth;
        const y = height - bottomPadding - ((price - minPrice + pricePadding) / (priceRange + pricePadding * 2)) * chartHeight;
        return { x, y, price, index };
    });
    
    if (points.length > 1) {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
        
        // 각 점에 원 그리기
        points.forEach((point) => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    }
    
    // 마우스 호버 이벤트 추가
    setupChartHover(canvas, points, isPositive);
    
    return points;
}

// 그래프 호버 이벤트 설정
function setupChartHover(canvas, points, isPositive) {
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
    
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 가장 가까운 점 찾기
        let closestPoint = null;
        let minDistance = Infinity;
        
        points.forEach(point => {
            const distance = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
            if (distance < minDistance && distance < 20) { // 20px 반경 내
                minDistance = distance;
                closestPoint = point;
            }
        });
        
        if (closestPoint) {
            tooltip.style.display = 'block';
            tooltip.innerHTML = `
                <div class="tooltip-content">
                    <div class="tooltip-label">${closestPoint.index + 1}일</div>
                    <div class="tooltip-price">${formatPrice(closestPoint.price)}</div>
                </div>
            `;
            
            // 툴팁 위치 설정
            const tooltipX = e.clientX + 15;
            const tooltipY = e.clientY - 50;
            tooltip.style.left = tooltipX + 'px';
            tooltip.style.top = tooltipY + 'px';
        } else {
            tooltip.style.display = 'none';
        }
    });
    
    canvas.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
    });
}

function formatNewsDate(raw) {
    if (!raw) return "";
  
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    const h = raw.slice(8, 10);
    const min = raw.slice(10, 12);
  
    return `${y}.${m}.${d} ${h}:${min}`;
  }
  

function loadNaverNews(stockCode) {
    fetch(`http://localhost:5000/api/naver/news?code=${stockCode}`)
      .then(res => res.json())
      .then(newsList => {
        const container = document.getElementById("newsList");
        container.innerHTML = "";
  
        if (!newsList || newsList.length === 0) {
          container.innerHTML = "<p>뉴스가 없습니다.</p>";
          return;
        }
  
        newsList.forEach(news => {
          const div = document.createElement("div");
          div.className = "news-item";
  
          div.innerHTML = `
            <div class="news-title">${news.title}</div>
            <div class="news-meta">
              ${news.press || ""} · ${formatNewsDate(news.date)}
            </div>
          `;
  
          div.onclick = () => {
            window.open(news.url, "_blank");
          };
  
          container.appendChild(div);
        });
      })
      .catch(err => {
        console.error("뉴스 로드 실패", err);
      });
  }
  

// 모달 열기
function openChartModal(symbol, name, prices, isPositive) {
    const modal = document.getElementById('chartModal');
    const modalChart = document.getElementById('modalChart');
    const modalStockName = document.getElementById('modalStockName');
    const modalPriceList = document.getElementById('modalPriceList');
    
    if (!modal || !modalChart) return;
    
    modalStockName.textContent = name || '주식 상세 정보';
    
    // 다운로드 버튼에 데이터 저장
    const downloadBtn = document.getElementById('downloadChartBtn');
    if (downloadBtn) {
        downloadBtn.setAttribute('data-symbol', symbol);
        downloadBtn.setAttribute('data-name', name);
    }
    
    // 현재 주식 데이터 가져오기
    fetchStockData(symbol).then(currentData => {
        // 큰 그래프 그리기
        const points = drawLargeChart(modalChart, prices, isPositive);
        
        // 통계 계산
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        const firstPrice = prices[0];
        const lastPrice = prices[prices.length - 1];
        const totalChange = lastPrice - firstPrice;
        const totalChangePercent = ((totalChange / firstPrice) * 100);
        
        // 가격 목록 및 상세 정보 표시
        if (points && points.length > 0) {
            modalPriceList.innerHTML = `
                <div class="modal-stats">
                    <div class="stat-item">
                        <span class="stat-label">현재가</span>
                        <span class="stat-value">${currentData && currentData.price ? formatPrice(currentData.price) : formatPrice(lastPrice)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">기간 시작가</span>
                        <span class="stat-value">${formatPrice(firstPrice)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">기간 종료가</span>
                        <span class="stat-value">${formatPrice(lastPrice)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">최고가</span>
                        <span class="stat-value positive">${formatPrice(maxPrice)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">최저가</span>
                        <span class="stat-value negative">${formatPrice(minPrice)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">평균가</span>
                        <span class="stat-value">${formatPrice(avgPrice)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">기간 변동</span>
                        <span class="stat-value ${totalChange >= 0 ? 'positive' : 'negative'}">
                            ${totalChange >= 0 ? '+' : ''}${formatPrice(totalChange)} (${totalChangePercent >= 0 ? '+' : ''}${totalChangePercent.toFixed(2)}%)
                        </span>
                    </div>
                    ${currentData && currentData.volume ? `
                    <div class="stat-item">
                        <span class="stat-label">거래량</span>
                        <span class="stat-value">${formatNumber(currentData.volume)}</span>
                    </div>
                    ` : ''}
                </div>

            `;
        }
    });
    
    modal.style.display = 'flex';
    loadNaverNews(symbol);
}

// 모달 닫기
function closeChartModal() {
    const modal = document.getElementById('chartModal');
    if (modal) {
        modal.style.display = 'none';
    }
}



// 페이지 로드 시 데이터 가져오기
document.addEventListener('DOMContentLoaded', () => {
    setupStockCardClickHandlers();
    updateAllStocks();
    
    // 더보기/숨기기 버튼 이벤트
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const hideMoreBtn = document.getElementById('hideMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', loadMoreStocks);
    }
    if (hideMoreBtn) {
        hideMoreBtn.addEventListener('click', hideMoreStocks);
    }
    
    // 모달 닫기 이벤트
    const closeBtn = document.getElementById('closeChartModal');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeChartModal);
    }
    
    // 모달 배경 클릭 시 닫기
    const modal = document.getElementById('chartModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeChartModal();
            }
        });
    }
    
    // ESC 키로 모달 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeChartModal();
        }
    });
    
    // matplotlib 차트 다운로드 버튼
    const downloadBtn = document.getElementById('downloadChartBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            const symbol = downloadBtn.getAttribute('data-symbol');
            const name = downloadBtn.getAttribute('data-name');
            
            if (!symbol) {
                alert('주식 정보를 찾을 수 없습니다.');
                return;
            }
            
            downloadBtn.disabled = true;
            downloadBtn.textContent = '생성 중...';
            
            try {
                const response = await fetch('http://localhost:5000/api/stock-chart', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        symbol: symbol,
                        name: name
                    })
                });
                
                if (response.ok) {
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${name}_${symbol.replace('.', '_')}_chart.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                } else {
                    const error = await response.json();
                    alert(`차트 생성 실패: ${error.error || '알 수 없는 오류'}`);
                }
            } catch (error) {
                console.error('다운로드 오류:', error);
                alert('서버에 연결할 수 없습니다. Python 서버가 실행 중인지 확인하세요.\n\n실행 방법:\npip install -r requirements.txt\npython app.py');
            } finally {
                downloadBtn.disabled = false;
                downloadBtn.textContent = '📥 matplotlib 차트 다운로드';
            }
        });
    }
    
    // 30초마다 자동 업데이트
    setInterval(updateAllStocks, 30000);
});

