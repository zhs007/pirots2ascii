# Pirots2ASCII - Game Board Visualization Tool

A Node.js project for parsing game XML data files and visualizing game board states in ASCII format.

## Features

- 📁 XML file upload support
- 🎮 Parse game board data (window, reels, layer data)
- 🎨 Visualize game boards in ASCII format
- 📋 Display all game states in chronological order
- 🏷️ Automatic data type detection (REELS, LAYER, WINDOW)
- 🔍 View raw data
- 🎯 Highlight specific positions with mask data
- 🔄 Support for rotated board display (90-degree clockwise rotation)

## Installation and Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Or use development mode (auto-restart):
```bash
npm run dev
```

4. Open your browser and visit: `http://localhost:3001`

## How to Use

1. Open the application in your browser
2. Click "Choose File" to upload your XML file
3. Click "Parse and Display Game Board" button
4. View the parsing results, including:
   - REELSET reels data
   - LAYER data
   - ACTION window data
   - ASCII-formatted game boards
   - Raw data (optional viewing)
   - Highlighted positions based on mask data

## Data Format Description

The XML file supports three data formats:

**REELSET reels data:**
- Original game reel data
- Uses `|` to separate columns, `;` to separate rows
- Each cell data is separated by `,`, with the third part being the symbol data

**LAYER data:**
- Game layer display data
- Same format as reels data

**ACTION window data:**
- Game board data from game actions
- Same format as reels data
- May include mask data for highlighting specific positions

## Supported Symbol Mapping

- Numbers: 0-9
- Letters: a-f → A-F
- Special symbols: w → W, M → M, X → X
- Empty cells: - → · (dot)

## Board Display Format

The game board is displayed with a 90-degree clockwise rotation for better visualization:
- Original left becomes bottom
- Original right becomes top
- Original top becomes right
- Original bottom becomes left

## Project Structure

```
pirots2ascii/
├── package.json        # Project configuration
├── server.js          # Main server file
├── uploads/           # Temporary upload directory
├── data001.xml        # Sample XML data files
├── data002.xml
├── ...
└── README.md         # Project documentation
```

## Dependencies

- `express`: Web server framework
- `multer`: File upload handling
- `xml2js`: XML parsing library

## API Endpoints

- `GET /`: Main web interface
- `POST /upload`: XML file upload and parsing endpoint

## Example XML Structure

The tool expects XML files with the following structure:

```xml
<response>
  <game>
    <pubdata><![CDATA[
      <PURCHASES>
        <PURCHASE>
          <RESULT>
            <SCOPE>
              <REELSET>
                <LAYER data="cell1,data1,symbol1;cell2,data2,symbol2|..." />
              </REELSET>
            </SCOPE>
            <ACTIONS>
              <ORDERED>
                <ACTION name="action-name" window="..." mask="..." />
              </ORDERED>
            </ACTIONS>
          </RESULT>
        </PURCHASE>
      </PURCHASES>
    ]]></pubdata>
  </game>
</response>
```

## Features in Detail

### Board Visualization
- Displays game boards in ASCII format with clear borders
- Supports symbol mapping for better readability
- Rotated display for optimal viewing

### Mask-based Highlighting
- Parses hexadecimal mask values
- Converts to binary for position mapping
- Highlights specific board positions in yellow (web) or ANSI colors (terminal)

### Multiple Data Sources
- Processes REELSET data (base game state)
- Handles LAYER data (overlay information)
- Parses ACTION data (game progression states)

## License

MIT License

## Author

Created for parsing and visualizing game board states from XML data files.
- `xml2js`: XML 解析器
- `nodemon`: 开发时自动重启 (开发依赖)
