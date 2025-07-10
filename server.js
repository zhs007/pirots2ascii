const express = require('express');
const multer = require('multer');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

// 配置文件上传
const upload = multer({ dest: 'uploads/' });

// 静态文件服务
app.use(express.static('public'));

// 创建符号映射表
const symbolMap = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5',
  '6': '6', '7': '7', '8': '8', '9': '9', 'a': 'a', 'b': 'b',
  'c': 'c', 'd': 'd', 'e': 'E', 'f': 'F', 'w': 'W', 'M': 'M',
  'X': 'X', '-': '·', 'B': 'F'
};

// 检查局面是否为空（只包含空白符号）
function isBoardEmpty(board) {
  if (!board || board.length === 0) return true;
  
  for (let row of board) {
    for (let cell of row) {
      if (cell && cell !== ' ' && cell !== '·' && cell !== '-') {
        return false;
      }
    }
  }
  return true;
}

// 解析局面数据的函数
function parseWindowData(windowStr) {
  if (!windowStr) return [];
  
  const rows = windowStr.split('|');
  const board = [];
  
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].split(';');
    const row = [];
    
    for (let j = 0; j < cells.length; j++) {
      const cellData = cells[j].split(',');
      if (cellData.length >= 3) {
        const symbol = cellData[2];
        row.push(symbolMap[symbol] || symbol);
      } else {
        row.push(' ');
      }
    }
    board.push(row);
  }
  
  return board;
}

// 解析位掩码并返回高亮位置
function parseMask(maskStr) {
  if (!maskStr) return [];
  
  // 移除可能的前缀0并转换为二进制
  const hexValue = maskStr.replace(/^0+/, '') || '0';
  const binaryStr = parseInt(hexValue, 16).toString(2).padStart(64, '0');
  
  const positions = [];
  // 从右到左遍历二进制字符串（对应从左上到右下的游戏位置）
  for (let i = 0; i < 64; i++) {
    if (binaryStr[63 - i] === '1') {
      const row = Math.floor(i / 8);
      const col = i % 8;
      positions.push({ row, col });
    }
  }
  
  return positions;
}

// 格式化ASCII输出（支持高亮显示）
function formatBoard(board, title = '', highlightPositions = [], isHTML = false) {
  if (!board || board.length === 0) return '';
  
  let output = '';
  if (title) {
    output += `\n=== ${title} ===\n`;
  }
  
  const rows = board.length;
  const cols = board[0] ? board[0].length : 0;
  
  // 实现"左为下，右为上，上为右，下为左"的显示
  // 在360度基础上再顺时针转90度（总共90度旋转）
  
  // 添加顶部边框
  output += '+' + '-'.repeat(rows * 2 + 1) + '+\n';
  
  // 90度顺时针旋转：按列从右到左遍历，每列从上到下
  for (let col = cols - 1; col >= 0; col--) {
    output += '| ';
    for (let row = 0; row < rows; row++) {
      const cell = board[row][col];
      const symbol = (cell || ' ');
      
      // 检查当前位置是否需要高亮
      const isHighlighted = highlightPositions.some(pos => 7-pos.row === row && pos.col === col);
      
      if (isHighlighted) {
        if (isHTML) {
          // HTML模式：使用span标签和CSS样式
          output += `<span style="background-color: yellow; color: black; font-weight: bold;">${symbol}</span> `;
        } else {
          // 终端模式：使用ANSI颜色代码（黄色背景）
          output += `\x1b[43m${symbol}\x1b[0m `;
        }
      } else {
        output += symbol + ' ';
      }
    }
    output += '|\n';
  }
  
  // 添加底部边框
  output += '+' + '-'.repeat(rows * 2 + 1) + '+\n';
  
  return output;
}

// 解析路径数据，将分号分隔的x,y坐标转换为坐标数组
function parsePath(pathStr) {
  if (!pathStr) return [];
  
  const coordinates = pathStr.split(';');
  return coordinates.map(coord => {
    const [x, y] = coord.split(',').map(Number);
    return { x, y };
  });
}

// 创建路径可视化的ASCII表格
function visualizePath(pathCoords, title, gridSize = { width: 8, height: 8 }) {
  const grid = Array(gridSize.height).fill().map(() => Array(gridSize.width).fill('·'));
  
  // 标记路径上的点
  pathCoords.forEach((coord, index) => {
    if (coord.x >= 0 && coord.x < gridSize.width && coord.y >= 0 && coord.y < gridSize.height) {
      if (index === 0) {
        grid[coord.y][coord.x] = 'S'; // Start
      } else if (index === pathCoords.length - 1) {
        grid[coord.y][coord.x] = 'E'; // End
      } else {
        grid[coord.y][coord.x] = '●'; // Path point
      }
    }
  });
  
  // 生成ASCII输出
  let output = `${title}\n`;
  output += '+' + '-'.repeat(gridSize.width * 2 + 1) + '+\n';
  
  for (let row = 0; row < gridSize.height; row++) {
    output += '| ';
    for (let col = 0; col < gridSize.width; col++) {
      output += grid[row][col] + ' ';
    }
    output += '|\n';
  }
  
  output += '+' + '-'.repeat(gridSize.width * 2 + 1) + '+\n';
  output += `路径: ${pathCoords.map(coord => `(${coord.x},${coord.y})`).join(' → ')}\n`;
  
  return output;
}

// 新的STEP路径可视化函数，支持S、P、E标记
function visualizeStepPath(points, title, gridSize = { width: 8, height: 8 }) {
  const grid = Array(gridSize.height).fill().map(() => Array(gridSize.width).fill('·'));
  
  // 标记不同类型的点
  points.forEach(point => {
    if (point.x >= 0 && point.x < gridSize.width && point.y >= 0 && point.y < gridSize.height) {
      grid[7-point.y][point.x] = point.type; // S, P, 或 E
    }
  });
  
  // 生成ASCII输出
  let output = `${title}\n`;
  output += '+' + '-'.repeat(gridSize.width * 2 + 1) + '+\n';
  
  for (let row = 0; row < gridSize.height; row++) {
    output += '| ';
    for (let col = 0; col < gridSize.width; col++) {
      output += grid[row][col] + ' ';
    }
    output += '|\n';
  }
  
  output += '+' + '-'.repeat(gridSize.width * 2 + 1) + '+\n';
  
  // 分类显示点的信息
  const startPoints = points.filter(p => p.type === 'S');
  const pathPoints = points.filter(p => p.type === 'P');
  const endPoints = points.filter(p => p.type === 'E');
  
  if (startPoints.length > 0) {
    output += `起点(S): ${startPoints.map(p => `(${p.x},${p.y})`).join(', ')}\n`;
  }
  if (pathPoints.length > 0) {
    output += `路径(P): ${pathPoints.map(p => `(${p.x},${p.y})`).join(' → ')}\n`;
  }
  if (endPoints.length > 0) {
    output += `终点(E): ${endPoints.map(p => `(${p.x},${p.y})`).join(', ')}\n`;
  }
  
  return output;
}

// 解析XML并提取所有window数据和STEP数据
function parseGameData(xmlContent) {
  const parser = new xml2js.Parser({ explicitArray: false });
  const results = [];
  
  return new Promise((resolve, reject) => {
    parser.parseString(xmlContent, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      
      try {
        // 提取CDATA内容
        const pubdata = result.response.game.pubdata;
        
        // 解析内部XML
        parser.parseString(pubdata, (err, gameData) => {
          if (err) {
            reject(err);
            return;
          }
          
          const purchase = gameData.PURCHASES.PURCHASE;
          let sequenceNumber = 1;
          
          // 解析每个RESULT中的数据
          if (purchase.RESULT) {
            const results_data = Array.isArray(purchase.RESULT) ? purchase.RESULT : [purchase.RESULT];
            console.log(`Found ${results_data.length} RESULT(s)`);
            
               results_data.forEach((result, resultIndex) => {
            console.log(`Processing Result ${resultIndex}`);
            
            // 处理REELSET - 可能是数组或单个对象
            // 暂时注释掉 reels 和 layer 的显示
            /*
            if (result.SCOPE && result.SCOPE.REELSET) {
              const reelsets = Array.isArray(result.SCOPE.REELSET) 
                ? result.SCOPE.REELSET 
                : [result.SCOPE.REELSET];
              
              console.log(`Result ${resultIndex} has ${reelsets.length} REELSET(s)`);
              
              // 先收集所有的 reels 和 layer 数据，然后按正确顺序添加
              const currentResultData = [];
              
              reelsets.forEach((reelset, reelsetIndex) => {
                console.log(`Processing REELSET ${reelsetIndex} in Result ${resultIndex}`);
                console.log(`REELSET structure:`, JSON.stringify(reelset, null, 2).substring(0, 200));
                
                // 1. 先添加 REELSET 中的 reels 数据
                // XML属性通常在 $ 对象中，或者直接作为属性
                const reelsData = reelset.$ && reelset.$.reels || reelset.reels;
                if (reelsData) {
                  console.log(`Found reels data in REELSET ${reelsetIndex}: ${reelsData.substring(0, 50)}...`);
                  const board = parseWindowData(reelsData);
                  currentResultData.push({
                    type: 'reels',
                    title: `Result ${resultIndex} - REELSET${reelsetIndex > 0 ? ` (${reelsetIndex})` : ''} Reels`,
                    board: board,
                    rawData: reelsData,
                    dataType: 'reels',
                    order: 1 // reels 优先级为 1
                  });
                }
                
                // 2. 然后添加 LAYER 中的 data 数据
                if (reelset.LAYER) {
                  const layers = Array.isArray(reelset.LAYER) 
                    ? reelset.LAYER 
                    : [reelset.LAYER];
                  
                  console.log(`Found ${layers.length} LAYER(s) in REELSET ${reelsetIndex}`);
                  
                  layers.forEach((layer, layerIndex) => {
                    let layerData = null;
                    
                    // 尝试各种可能的属性访问方式
                    if (layer.$ && layer.$.data) {
                      layerData = layer.$.data;
                    } else if (layer.data) {
                      layerData = layer.data;
                    } else if (typeof layer === 'string') {
                      layerData = layer;
                    }
                    
                    if (layerData) {
                      console.log(`Found layer data ${layerIndex}: ${layerData.substring(0, 50)}...`);
                      const board = parseWindowData(layerData);
                      currentResultData.push({
                        type: 'layer',
                        title: `Result ${resultIndex} - LAYER${layerIndex > 0 ? ` (${layerIndex})` : ''} Data`,
                        board: board,
                        rawData: layerData,
                        dataType: 'layer',
                        order: 2 // layer 优先级为 2
                      });
                    }
                  });
                }
              });
              
              // 按正确顺序排序：先 reels，后 layer
              currentResultData.sort((a, b) => a.order - b.order);
              console.log(`Current result data after sorting:`, currentResultData.map(item => `${item.order}:${item.type}`));
              
              // 添加序号并加入结果
              currentResultData.forEach(item => {
                item.title = `${sequenceNumber++}. ${item.title}`;
                console.log(`Adding: ${item.title}`);
                delete item.order; // 删除临时的排序字段
                results.push(item);
              });
            }
            */
            
            // 3. 动作中的window数据和STEP数据
            if (result.ACTIONS && result.ACTIONS.ORDERED && result.ACTIONS.ORDERED.ACTION) {
              const actions = Array.isArray(result.ACTIONS.ORDERED.ACTION) 
                ? result.ACTIONS.ORDERED.ACTION 
                : [result.ACTIONS.ORDERED.ACTION];
              
              actions.forEach((action, actionIndex) => {
                // 处理window数据
                if (action.$ && action.$.window) {
                  const board = parseWindowData(action.$.window);
                  
                  // 解析mask（如果存在）来获取高亮位置
                  let highlightPositions = [];
                  let maskInfo = '';
                  if (action.$.mask) {
                    highlightPositions = parseMask(action.$.mask);
                    maskInfo = ` (Mask: ${action.$.mask}, ${highlightPositions.length} positions)`;
                  }
                  
                  results.push({
                    type: 'action',
                    title: `${sequenceNumber++}. Result ${resultIndex} - Action: ${action.$.name || 'Unknown'}${maskInfo}`,
                    board: board,
                    rawData: action.$.window,
                    actionName: action.$.name,
                    dataType: 'window',
                    highlightPositions: highlightPositions,
                    mask: action.$.mask
                  });
                }
                
                // 处理STEP数据 - 提取path信息
                if (action.STEP) {
                  const steps = Array.isArray(action.STEP) ? action.STEP : [action.STEP];
                  
                  steps.forEach((step, stepIndex) => {
                    if (step.$) {
                      // 收集所有点：起点(S)、路径点(P)、终点(E)
                      const allPoints = [];
                      
                      // 添加起点 (prev-pos)
                      if (step.$['prev-pos']) {
                        const [x, y] = step.$['prev-pos'].split(',').map(Number);
                        allPoints.push({ x, y, type: 'S', label: '起点' });
                      }
                      
                      // 添加路径点 (path)
                      if (step.$.path) {
                        const pathPoints = parsePath(step.$.path);
                        pathPoints.forEach(point => {
                          allPoints.push({ x: point.x, y: point.y, type: 'P', label: '路径' });
                        });
                      }
                      
                      // 添加终点 (pos)
                      if (step.$.pos) {
                        const [x, y] = step.$.pos.split(',').map(Number);
                        allPoints.push({ x, y, type: 'E', label: '终点' });
                      }
                      
                      if (allPoints.length > 0) {
                        const pathVisualization = visualizeStepPath(allPoints, 
                          `Action: ${action.$.name || 'Unknown'} - Step ${stepIndex + 1}`);
                        
                        results.push({
                          type: 'step',
                          title: `${sequenceNumber++}. Result ${resultIndex} - Action: ${action.$.name || 'Unknown'} - Step ${stepIndex + 1} Path`,
                          board: null, // 不使用标准棋盘，使用路径可视化
                          pathVisualization: pathVisualization,
                          pathCoords: allPoints,
                          rawData: `Path: ${step.$.path || 'N/A'}, Position: ${step.$.pos || 'N/A'}, Previous: ${step.$['prev-pos'] || 'N/A'}`,
                          actionName: action.$.name,
                          dataType: 'path',
                          stepData: {
                            path: step.$.path,
                            pos: step.$.pos,
                            prevPos: step.$['prev-pos'],
                            sym: step.$.sym,
                            win: step.$.win,
                            angryBirds: step.$['angry-birds'],
                            firstStep: step.$['first-step'],
                            lastStep: step.$['last-step']
                          }
                        });
                      }
                    }
                  });
                }
              });
            }
          });
        }
          
          resolve(results);
        });
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

// 主页面
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pirots2ASCII - 游戏局面重现</title>
        <style>
            body {
                font-family: 'Courier New', monospace;
                margin: 20px;
                background-color: #f5f5f5;
            }
            .container {
                max-width: 1200px;
                margin: 0 auto;
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 {
                color: #333;
                text-align: center;
                margin-bottom: 30px;
            }
            .upload-area {
                border: 2px dashed #ccc;
                border-radius: 8px;
                padding: 40px;
                text-align: center;
                margin-bottom: 30px;
                background-color: #fafafa;
            }
            .upload-area:hover {
                border-color: #007bff;
                background-color: #f0f8ff;
            }
            .btn {
                background-color: #007bff;
                color: white;
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 16px;
            }
            .btn:hover {
                background-color: #0056b3;
            }
            .results {
                margin-top: 30px;
            }
            .board-container {
                margin: 20px 0;
                padding: 15px;
                background-color: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 5px;
            }
            .board-title {
                font-weight: bold;
                color: #495057;
                margin-bottom: 10px;
            }
            .board {
                font-family: 'Courier New', monospace;
                background-color: #000;
                color: #00ff00;
                padding: 15px;
                border-radius: 4px;
                white-space: pre;
                overflow-x: auto;
                font-size: 14px;
                line-height: 1.2;
            }
            .raw-data {
                font-size: 12px;
                color: #666;
                background-color: #f1f1f1;
                padding: 10px;
                border-radius: 4px;
                margin-top: 10px;
                word-break: break-all;
            }
            .toggle-raw {
                font-size: 12px;
                color: #007bff;
                cursor: pointer;
                text-decoration: underline;
                margin-top: 5px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎮 Pirots2ASCII - 游戏局面重现工具</h1>
            
            <div class="upload-area">
                <h3>上传 XML 文件</h3>
                <p>请选择包含游戏数据的 XML 文件</p>
                <form action="/upload" method="post" enctype="multipart/form-data">
                    <input type="file" name="xmlfile" accept=".xml" required style="margin: 10px;">
                    <br>
                    <button type="submit" class="btn">解析并显示游戏局面</button>
                </form>
            </div>
            
            <div class="results" id="results"></div>
        </div>
        
        <script>
            function toggleRaw(id) {
                const element = document.getElementById('raw-' + id);
                if (element.style.display === 'none') {
                    element.style.display = 'block';
                } else {
                    element.style.display = 'none';
                }
            }
        </script>
    </body>
    </html>
  `);
});

// 处理文件上传
app.post('/upload', upload.single('xmlfile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('请选择一个文件');
    }
    
    // 读取上传的文件
    const xmlContent = fs.readFileSync(req.file.path, 'utf8');
    
    // 解析游戏数据
    const gameStates = await parseGameData(xmlContent);
    
    // 生成HTML输出
    let html = `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>游戏局面重现结果</title>
          <style>
              body {
                  font-family: 'Courier New', monospace;
                  margin: 20px;
                  background-color: #f5f5f5;
              }
              .container {
                  max-width: 1200px;
                  margin: 0 auto;
                  background: white;
                  padding: 20px;
                  border-radius: 8px;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              h1 {
                  color: #333;
                  text-align: center;
                  margin-bottom: 30px;
              }
              .back-btn {
                  background-color: #6c757d;
                  color: white;
                  padding: 8px 16px;
                  border: none;
                  border-radius: 4px;
                  cursor: pointer;
                  text-decoration: none;
                  display: inline-block;
                  margin-bottom: 20px;
              }
              .back-btn:hover {
                  background-color: #545b62;
              }
              .board-container {
                  margin: 20px 0;
                  padding: 15px;
                  background-color: #f8f9fa;
                  border: 1px solid #dee2e6;
                  border-radius: 5px;
              }
              .board-title {
                  font-weight: bold;
                  color: #495057;
                  margin-bottom: 10px;
                  font-size: 16px;
              }
              .board {
                  font-family: 'Courier New', monospace;
                  background-color: #000;
                  color: #00ff00;
                  padding: 15px;
                  border-radius: 4px;
                  white-space: pre;
                  overflow-x: auto;
                  font-size: 14px;
                  line-height: 1.2;
              }
              .raw-data {
                  font-size: 12px;
                  color: #666;
                  background-color: #f1f1f1;
                  padding: 10px;
                  border-radius: 4px;
                  margin-top: 10px;
                  word-break: break-all;
                  display: none;
              }
              .toggle-raw {
                  font-size: 12px;
                  color: #007bff;
                  cursor: pointer;
                  text-decoration: underline;
                  margin-top: 5px;
              }
              .summary {
                  background-color: #e9ecef;
                  padding: 15px;
                  border-radius: 5px;
                  margin-bottom: 20px;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <a href="/" class="back-btn">← 返回上传页面</a>
              <h1>🎮 游戏局面重现结果</h1>
              
              <div class="summary">
                  <h3>解析摘要</h3>
                  <p>总共找到 <strong>${gameStates.length}</strong> 个游戏状态</p>
                  <p>文件名: <strong>${req.file.originalname}</strong></p>
              </div>
    `;
    
    // 添加每个游戏状态
    gameStates.forEach((state, index) => {
      let content = '';
      let dataTypeColor = '#dc3545'; // default red for window
      
      if (state.dataType === 'path') {
        // 路径可视化
        content = state.pathVisualization;
        dataTypeColor = '#ff6b35'; // orange for path
      } else {
        // 标准棋盘显示
        content = formatBoard(state.board, state.title, state.highlightPositions || [], true);
        dataTypeColor = state.dataType === 'reels' ? '#007bff' : 
                       state.dataType === 'layer' ? '#28a745' : '#dc3545';
      }
      
      const dataTypeBadge = `<span style="background-color: ${dataTypeColor}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-left: 10px;">${state.dataType?.toUpperCase() || 'WINDOW'}</span>`;
      
      html += `
        <div class="board-container">
            <div class="board-title">${state.title} ${dataTypeBadge}</div>
            <div class="board">${content}</div>
            <div class="toggle-raw" onclick="toggleRaw(${index})">
                显示/隐藏详细信息
            </div>
            <div class="raw-data" id="raw-${index}">
                <strong>数据类型:</strong> ${state.dataType?.toUpperCase() || 'WINDOW'}<br>
                ${state.mask ? `<strong>位掩码:</strong> ${state.mask}<br>` : ''}
                ${state.highlightPositions && state.highlightPositions.length > 0 ? 
                  `<strong>高亮位置:</strong> ${state.highlightPositions.map(p => `(${p.row},${p.col})`).join(', ')}<br>` : ''}
                ${state.pathCoords && state.pathCoords.length > 0 ? 
                  `<strong>路径坐标:</strong> ${state.pathCoords.map(p => `(${p.x},${p.y})`).join(' → ')}<br>` : ''}
                ${state.stepData ? `
                  <strong>步骤信息:</strong><br>
                  • 符号: ${state.stepData.sym || 'N/A'}<br>
                  • 当前位置: ${state.stepData.pos || 'N/A'}<br>
                  • 前一位置: ${state.stepData.prevPos || 'N/A'}<br>
                  • 赢分: ${state.stepData.win || '0'}<br>
                  ${state.stepData.firstStep ? '• 首步<br>' : ''}
                  ${state.stepData.lastStep ? '• 末步<br>' : ''}
                  ${state.stepData.angryBirds ? `• 愤怒的小鸟: ${state.stepData.angryBirds}<br>` : ''}
                ` : ''}
                <strong>原始数据:</strong><br>
                ${state.rawData}
            </div>
        </div>
      `;
    });
    
    html += `
          </div>
          
          <script>
              function toggleRaw(id) {
                  const element = document.getElementById('raw-' + id);
                  if (element.style.display === 'none') {
                      element.style.display = 'block';
                  } else {
                      element.style.display = 'none';
                  }
              }
          </script>
      </body>
      </html>
    `;
    
    // 清理上传的临时文件
    fs.unlinkSync(req.file.path);
    
    res.send(html);
    
  } catch (error) {
    console.error('解析错误:', error);
    res.status(500).send(`
      <h1>解析错误</h1>
      <p>无法解析上传的XML文件: ${error.message}</p>
      <a href="/">返回</a>
    `);
  }
});

// 确保uploads目录存在
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

app.listen(port, () => {
  console.log(`Pirots2ASCII 服务器运行在 http://localhost:${port}`);
  console.log('请打开浏览器访问上述地址来上传和解析XML文件');
});
