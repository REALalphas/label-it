# Asset Label Generator

A professional asset label generation system with Snipe-IT integration. Generate high-quality PDF labels and PNG previews with QR codes, barcodes, and DataMatrix codes for your asset management workflow.

## Features

- **Multiple Label Formats**: Standard (50×25mm), Medium (40×30mm), DataMatrix (15×15mm), and Cable Flag (12×40mm)
- **Batch Label Generation**: Select multiple assets and generate combined PDF documents for efficient printing
- **Snipe-IT Integration**: Direct integration with your Snipe-IT instance for seamless asset data retrieval
- **Real-time Previews**: Generate PNG previews of labels before printing with lazy loading optimization
- **Professional PDF Output**: High-quality PDF generation optimized for label printing
- **Advanced Search**: Search assets by name, tag, serial number, or category
- **Flexible Grouping**: Group assets by category, model, or status
- **Asset Selection**: Multi-select functionality with batch operations
- **Responsive Design**: Works perfectly on desktop and mobile devices
- **Custom Field Support**: Automatically includes relevant custom fields in labels

## Label Types

### Standard Label (50×25mm)
- QR code linking to asset in Snipe-IT
- Asset tag, category, name/model
- Custom field information
- Barcode with asset ID

### Medium Label (40×30mm)
- Compact version of standard label
- Rotated text for better space utilization
- QR code and barcode included

### DataMatrix Label (15×15mm)
- Minimal design with DataMatrix code
- Asset tag only
- Perfect for small components

### Cable Flag Label (12×40mm)
- Designed for cable labeling
- Dual-sided design for wrapping
- Asset tag and name

## Requirements

- Node.js 18.0.0 or higher
- Snipe-IT instance with API access
- Modern web browser

## Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd label-it
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your configuration:
   ```env
   SNIPEIT_URL=https://your-snipe-it-instance.com
   SNIPEIT_API_TOKEN=your_api_token_here
   PORT=3000
   HOST=0.0.0.0
   COMPANY_NAME=Your Company Name
   ```

4. **Start the application:**
   ```bash
   npm start
   ```

5. **Access the application:**
   Open your browser to `http://localhost:3000`

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SNIPEIT_URL` | Yes | - | Your Snipe-IT instance URL |
| `SNIPEIT_API_TOKEN` | Yes | - | Snipe-IT API token with read access |
| `PORT` | No | 3000 | Server port |
| `HOST` | No | 0.0.0.0 | Server host |
| `LOG_LEVEL` | No | info | Logging level (error, warn, info, debug) |
| `COMPANY_NAME` | No | Asset Management | Company name displayed on labels |
| `MAX_ASSETS_LIMIT` | No | 2000 | Maximum assets to fetch from Snipe-IT |
| `CUSTOM_FIELD_MAPPING` | No | - | JSON mapping for custom field names |

### Custom Field Mapping

To use custom fields from your Snipe-IT instance, configure the `CUSTOM_FIELD_MAPPING` environment variable:

```env
CUSTOM_FIELD_MAPPING={"connector":"Your Connector Field","connector_2":"Your Second Connector Field","storage_size":"Your Storage Field","functionality":"Your Functionality Field","battery_chemistry":"Your Battery Chemistry Field","battery_size":"Your Battery Size Field","data_transfer":"Your Data Transfer Field"}
```

Default mappings (for Russian Snipe-IT instances):
- `connector`: "Коннектор"
- `connector_2`: "Коннектор 2"
- `storage_size`: "Хранилище Размер"
- `functionality`: "Работоспособность"
- `battery_chemistry`: "Химия Акб"
- `battery_size`: "Размер Акб (Ah)"
- `data_transfer`: "Передаёт данные?"

## API Endpoints

### `GET /`
Serves the main application interface.

### `GET /health`
Health check endpoint.
**Response:** `{ "status": "OK", "timestamp": "2024-01-15T10:30:00.000Z" }`

### `GET /assets`
Retrieves all assets from Snipe-IT.
**Response:** Array of asset objects

### `POST /generate`
Generates a single label in PDF or PNG format.

**Parameters:**
- `asset_id` (required): Asset ID from Snipe-IT
- `template_type` (required): Label type (`default`, `medium`, `datamatrix`, `cable_flag`)

**Headers:**
- `Accept: application/pdf` - Returns PDF (default)
- `Accept: image/png` - Returns PNG preview

### `POST /generate-batch`
Generates multiple labels in a single PDF document.

**Parameters:**
- `asset_ids` (required): Comma-separated list of asset IDs from Snipe-IT
- `template_type` (required): Label type for all assets (`default`, `medium`, `datamatrix`, `cable_flag`)

**Response:** Combined PDF document with all generated labels

## Usage

### Web Interface

1. **Search and Filter**: Use the collapsible search panel to find specific assets
2. **Asset Selection**:
   - Hover over asset cards to see selection checkboxes
   - Use bulk selection buttons: "Select All Visible", "Clear Selection", "Invert Selection"
3. **Individual Labels**: Click on any preview thumbnail to generate a single PDF label
4. **Batch Printing**:
   - Select multiple assets using checkboxes
   - Choose template type from the batch print bar at the bottom
   - Click "Generate Batch PDF" to create a combined document
5. **Preview System**: Label previews are generated automatically when assets are visible on screen

### Keyboard Shortcuts

- **Ctrl/Cmd + A**: Select all visible assets
- **Escape**: Clear selection
- **Enter** (on search): Focus first result

## Development

### Running in Development Mode
```bash
npm run dev
```

### Project Structure
```
label-it/
├── public/
│   └── index.html          # Main application interface with batch functionality
├── template*.html          # Label templates
├── index.js                # Main server application with batch endpoints
├── package.json            # Project configuration
├── .env.example            # Environment configuration template
└── README.md               # This file
```

### Adding New Label Types

1. Create a new HTML template file (e.g., `template_custom.html`)
2. Add the template case to both `/generate` and `/generate-batch` endpoints in `index.js`
3. Update the `LABEL_TYPES` array in `index.html`
4. Set appropriate page dimensions in the template

### Performance Considerations

- **Preview Loading**: Only visible previews are generated using Intersection Observer API
- **Batch Processing**: Large batch operations are processed sequentially to prevent memory issues
- **PDF Merging**: Uses pdf-lib for efficient PDF document combining
- **Memory Management**: Browser instances are properly closed after each operation

## Troubleshooting

### Common Issues

1. **"Invalid Snipe-IT API token" error**
   - Verify your API token is correct
   - Ensure the token has proper permissions in Snipe-IT

2. **"Failed to fetch assets" error**
   - Check network connectivity to Snipe-IT
   - Verify SNIPEIT_URL is correct
   - Check Snipe-IT API endpoint availability

3. **Preview images not loading**
   - Check browser console for errors
   - Verify Puppeteer can launch

4. **PDF generation fails**
   - Ensure sufficient memory is available
   - Check Puppeteer dependencies are installed

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Add tests if applicable
5. Commit your changes: `git commit -am 'Add feature'`
6. Push to the branch: `git push origin feature-name`
7. Submit a pull request

## Support

For support and questions:
- Create an issue in the repository
- Check existing issues for similar problems
- Review the troubleshooting section above

## Changelog

### Version 0.1
- Initial release
- Snipe-IT integration
- Multiple label formats
- Professional web interface
- Environment-based configuration
- Real-time preview generation

### Version 0.2
- Batch label generation with PDF merging
- Optimized preview loading with intersection observer
- Collapsible interface controls
- Multi-asset selection system
- Responsive design with mobile support
