const express = require('express');
const multer = require('multer');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

// Configure file upload
const upload = multer({ dest: 'uploads/' });

// Static file service
app.use(express.static('public'));

// Create symbol mapping table
const symbolMap = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5',
  '6': '6', '7': '7', '8': '8', '9': '9', 'a': 'a', 'b': 'b',
  'c': 'c', 'd': 'd', 'e': 'E', 'f': 'F', 'w': 'W', 'M': 'M',
  'X': 'X', '-': '·', 'B': 'F'
};

// Check if board is empty (contains only blank symbols)
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

// Function to parse board data
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

// Parse bit mask and return highlight positions
function parseMask(maskStr) {
  if (!maskStr) return [];
  
  // Remove possible prefix 0s and convert to binary
  const hexValue = maskStr.replace(/^0+/, '') || '0';
  const binaryStr = parseInt(hexValue, 16).toString(2).padStart(64, '0');
  
  const positions = [];
  // Traverse binary string from right to left (corresponding to game positions from top-left to bottom-right)
  for (let i = 0; i < 64; i++) {
    if (binaryStr[63 - i] === '1') {
      const row = Math.floor(i / 8);
      const col = i % 8;
      positions.push({ row, col });
    }
  }
  
  return positions;
}

// Format ASCII output (supports highlighting)
function formatBoard(board, title = '', highlightPositions = [], isHTML = false) {
  if (!board || board.length === 0) return '';
  
  let output = '';
  if (title) {
    output += `\n=== ${title} ===\n`;
  }
  
  const rows = board.length;
  const cols = board[0] ? board[0].length : 0;
  
  // Implement "left as down, right as up, up as right, down as left" display
  // 90-degree clockwise rotation on top of 360-degree base (total 90-degree rotation)
  
  // Add top border
  output += '+' + '-'.repeat(rows * 2 + 1) + '+\n';
  
  // 90-degree clockwise rotation: traverse columns from right to left, each column from top to bottom
  for (let col = cols - 1; col >= 0; col--) {
    output += '| ';
    for (let row = 0; row < rows; row++) {
      const cell = board[row][col];
      const symbol = (cell || ' ');
      
      // Check if current position needs highlighting
      const isHighlighted = highlightPositions.some(pos => 7-pos.row === row && pos.col === col);
      
      if (isHighlighted) {
        if (isHTML) {
          // HTML mode: use span tags and CSS styles
          output += `<span style="background-color: yellow; color: black; font-weight: bold;">${symbol}</span> `;
        } else {
          // Terminal mode: use ANSI color codes (yellow background)
          output += `\x1b[43m${symbol}\x1b[0m `;
        }
      } else {
        output += symbol + ' ';
      }
    }
    output += '|\n';
  }
  
  // Add bottom border
  output += '+' + '-'.repeat(rows * 2 + 1) + '+\n';
  
  return output;
}

// Parse path data, convert semicolon-separated x,y coordinates to coordinate array
function parsePath(pathStr) {
  if (!pathStr) return [];
  
  const coordinates = pathStr.split(';');
  return coordinates.map(coord => {
    const [x, y] = coord.split(',').map(Number);
    return { x, y };
  });
}

// Create ASCII table for path visualization
function visualizePath(pathCoords, title, gridSize = { width: 8, height: 8 }) {
  const grid = Array(gridSize.height).fill().map(() => Array(gridSize.width).fill('·'));
  
  // Mark points on the path
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
  
  // Generate ASCII output
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
  output += `Path: ${pathCoords.map(coord => `(${coord.x},${coord.y})`).join(' → ')}\n`;
  
  return output;
}

// New STEP path visualization function, supports S, sequential numbered path points, E markers
function visualizeStepPath(points, title, gridSize = { width: 8, height: 8 }) {
  const grid = Array(gridSize.height).fill().map(() => Array(gridSize.width).fill('·'));
  
  // Generate sequential labels for path points: 1,2,3...9,a,b,c...
  function getSequentialLabel(index) {
    if (index < 9) {
      return (index + 1).toString(); // 1-9
    } else {
      return String.fromCharCode(97 + index - 9); // a,b,c,d,e,f,g,h...
    }
  }
  
  // Mark different types of points
  let pathPointIndex = 0;
  points.forEach(point => {
    if (point.x >= 0 && point.x < gridSize.width && point.y >= 0 && point.y < gridSize.height) {
      if (point.type === 'S') {
        grid[7-point.y][point.x] = 'S'; // Start point
      } else if (point.type === 'E') {
        grid[7-point.y][point.x] = 'E'; // End point
      } else if (point.type === 'P') {
        grid[7-point.y][point.x] = getSequentialLabel(pathPointIndex); // Sequential path points
        pathPointIndex++;
      }
    }
  });
  
  // Generate ASCII output
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
  
  // Display point information by category
  const startPoints = points.filter(p => p.type === 'S');
  const pathPoints = points.filter(p => p.type === 'P');
  const endPoints = points.filter(p => p.type === 'E');
  
  if (startPoints.length > 0) {
    output += `Start Point(S): ${startPoints.map(p => `(${p.x},${p.y})`).join(', ')}\n`;
  }
  if (pathPoints.length > 0) {
    const pathLabels = pathPoints.map((p, index) => `${getSequentialLabel(index)}:(${p.x},${p.y})`);
    output += `Path Points: ${pathLabels.join(' → ')}\n`;
  }
  if (endPoints.length > 0) {
    output += `End Point(E): ${endPoints.map(p => `(${p.x},${p.y})`).join(', ')}\n`;
  }
  
  return output;
}

// Parse XML and extract all window data and STEP data
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
        // Extract CDATA content
        const pubdata = result.response.game.pubdata;
        
        // Parse internal XML
        parser.parseString(pubdata, (err, gameData) => {
          if (err) {
            reject(err);
            return;
          }
          
          const purchase = gameData.PURCHASES.PURCHASE;
          let sequenceNumber = 1;
          
          // Parse data in each RESULT
          if (purchase.RESULT) {
            const results_data = Array.isArray(purchase.RESULT) ? purchase.RESULT : [purchase.RESULT];
            console.log(`Found ${results_data.length} RESULT(s)`);
            
               results_data.forEach((result, resultIndex) => {
            console.log(`Processing Result ${resultIndex}`);
            
            // Handle REELSET - could be array or single object
            // Temporarily comment out reels and layer display
            /*
            if (result.SCOPE && result.SCOPE.REELSET) {
              const reelsets = Array.isArray(result.SCOPE.REELSET) 
                ? result.SCOPE.REELSET 
                : [result.SCOPE.REELSET];
              
              console.log(`Result ${resultIndex} has ${reelsets.length} REELSET(s)`);
              
              // First collect all reels and layer data, then add in correct order
              const currentResultData = [];
              
              reelsets.forEach((reelset, reelsetIndex) => {
                console.log(`Processing REELSET ${reelsetIndex} in Result ${resultIndex}`);
                console.log(`REELSET structure:`, JSON.stringify(reelset, null, 2).substring(0, 200));
                
                // 1. First add reels data from REELSET
                // XML attributes are usually in $ object, or directly as properties
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
                    order: 1 // reels priority is 1
                  });
                }
                
                // 2. Then add data from LAYER
                if (reelset.LAYER) {
                  const layers = Array.isArray(reelset.LAYER) 
                    ? reelset.LAYER 
                    : [reelset.LAYER];
                  
                  console.log(`Found ${layers.length} LAYER(s) in REELSET ${reelsetIndex}`);
                  
                  layers.forEach((layer, layerIndex) => {
                    let layerData = null;
                    
                    // Try various possible property access methods
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
                        order: 2 // layer priority is 2
                      });
                    }
                  });
                }
              });
              
              // Sort in correct order: reels first, then layer
              currentResultData.sort((a, b) => a.order - b.order);
              console.log(`Current result data after sorting:`, currentResultData.map(item => `${item.order}:${item.type}`));
              
              // Add sequence numbers and add to results
              currentResultData.forEach(item => {
                item.title = `${sequenceNumber++}. ${item.title}`;
                console.log(`Adding: ${item.title}`);
                delete item.order; // Delete temporary sorting field
                results.push(item);
              });
            }
            */
            
            // 3. Window data and STEP data in actions
            if (result.ACTIONS && result.ACTIONS.ORDERED && result.ACTIONS.ORDERED.ACTION) {
              const actions = Array.isArray(result.ACTIONS.ORDERED.ACTION) 
                ? result.ACTIONS.ORDERED.ACTION 
                : [result.ACTIONS.ORDERED.ACTION];
              
              actions.forEach((action, actionIndex) => {
                // Handle window data
                if (action.$ && action.$.window) {
                  const board = parseWindowData(action.$.window);
                  
                  // Parse mask (if exists) to get highlight positions
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
                
                // Handle STEP data - extract path information
                if (action.STEP) {
                  const steps = Array.isArray(action.STEP) ? action.STEP : [action.STEP];
                  
                  steps.forEach((step, stepIndex) => {
                    if (step.$) {
                      // Collect all points: start point(S), path points(P), end point(E)
                      const allPoints = [];
                      
                      // Add start point (prev-pos)
                      if (step.$['prev-pos']) {
                        const [x, y] = step.$['prev-pos'].split(',').map(Number);
                        allPoints.push({ x, y, type: 'S', label: 'Start Point' });
                      }
                      
                      // Add path points (path)
                      if (step.$.path) {
                        const pathPoints = parsePath(step.$.path);
                        pathPoints.forEach(point => {
                          allPoints.push({ x: point.x, y: point.y, type: 'P', label: 'Path' });
                        });
                      }
                      
                      // Add end point (pos)
                      if (step.$.pos) {
                        const [x, y] = step.$.pos.split(',').map(Number);
                        allPoints.push({ x, y, type: 'E', label: 'End Point' });
                      }
                      
                      if (allPoints.length > 0) {
                        const pathVisualization = visualizeStepPath(allPoints, 
                          `Action: ${action.$.name || 'Unknown'} - Step ${stepIndex + 1}`);
                        
                        results.push({
                          type: 'step',
                          title: `${sequenceNumber++}. Result ${resultIndex} - Action: ${action.$.name || 'Unknown'} - Step ${stepIndex + 1} Path`,
                          board: null, // Don't use standard board, use path visualization
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

// Main page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pirots2ASCII - Game Board Visualization</title>
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
            <h1>🎮 Pirots2ASCII - Game Board Visualization Tool</h1>
            
            <div class="upload-area">
                <h3>Upload XML File</h3>
                <p>Please select an XML file containing game data</p>
                <form action="/upload" method="post" enctype="multipart/form-data">
                    <input type="file" name="xmlfile" accept=".xml" required style="margin: 10px;">
                    <br>
                    <button type="submit" class="btn">Parse and Display Game Board</button>
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

// Handle file upload
app.post('/upload', upload.single('xmlfile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('Please select a file');
    }
    
    // Read uploaded file
    const xmlContent = fs.readFileSync(req.file.path, 'utf8');
    
    // Parse game data
    const gameStates = await parseGameData(xmlContent);
    
    // Generate HTML output
    let html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Game Board Visualization Results</title>
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
              <a href="/" class="back-btn">← Back to Upload</a>
              <h1>🎮 Game Board Visualization Results</h1>
              
              <div class="summary">
                  <h3>Parse Summary</h3>
                  <p>Total <strong>${gameStates.length}</strong> game states found</p>
                  <p>File name: <strong>${req.file.originalname}</strong></p>
              </div>
    `;
    
    // Add each game state
    gameStates.forEach((state, index) => {
      let content = '';
      let dataTypeColor = '#dc3545'; // default red for window
      
      if (state.dataType === 'path') {
        // Path visualization
        content = state.pathVisualization;
        dataTypeColor = '#ff6b35'; // orange for path
      } else {
        // Standard board display
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
                Show/Hide Details
            </div>
            <div class="raw-data" id="raw-${index}">
                <strong>Data Type:</strong> ${state.dataType?.toUpperCase() || 'WINDOW'}<br>
                ${state.mask ? `<strong>Bit Mask:</strong> ${state.mask}<br>` : ''}
                ${state.highlightPositions && state.highlightPositions.length > 0 ? 
                  `<strong>Highlight Positions:</strong> ${state.highlightPositions.map(p => `(${p.row},${p.col})`).join(', ')}<br>` : ''}
                ${state.pathCoords && state.pathCoords.length > 0 ? 
                  `<strong>Path Coordinates:</strong> ${state.pathCoords.map(p => `(${p.x},${p.y})`).join(' → ')}<br>` : ''}
                ${state.stepData ? `
                  <strong>Step Information:</strong><br>
                  • Symbol: ${state.stepData.sym || 'N/A'}<br>
                  • Current Position: ${state.stepData.pos || 'N/A'}<br>
                  • Previous Position: ${state.stepData.prevPos || 'N/A'}<br>
                  • Win Amount: ${state.stepData.win || '0'}<br>
                  ${state.stepData.firstStep ? '• First Step<br>' : ''}
                  ${state.stepData.lastStep ? '• Last Step<br>' : ''}
                  ${state.stepData.angryBirds ? `• Angry Birds: ${state.stepData.angryBirds}<br>` : ''}
                ` : ''}
                <strong>Raw Data:</strong><br>
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
    
    // Clean up uploaded temporary file
    fs.unlinkSync(req.file.path);
    
    res.send(html);
    
  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).send(`
      <h1>Parse Error</h1>
      <p>Unable to parse the uploaded XML file: ${error.message}</p>
      <a href="/">Back</a>
    `);
  }
});

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

app.listen(port, () => {
  console.log(`Pirots2ASCII server running on http://localhost:${port}`);
  console.log('Please open your browser and visit the above address to upload and parse XML files');
});
