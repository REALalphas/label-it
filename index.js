const fastify = require('fastify')
const path = require('path')
const puppeteer = require('puppeteer')
const axios = require('axios')
const fs = require('fs/promises')
const bwipjs = require('bwip-js')
const { PDFDocument } = require('pdf-lib')

// Load environment variables
require('dotenv').config()

// Configuration from environment variables
const config = {
    snipeItUrl: process.env.SNIPEIT_URL || 'https://demo.snipeitapp.com',
    snipeItToken: process.env.SNIPEIT_API_TOKEN,
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
    logLevel: process.env.LOG_LEVEL || 'info',
    companyName: process.env.COMPANY_NAME || 'Asset Management',
    maxAssetsLimit: parseInt(process.env.MAX_ASSETS_LIMIT) || 2000,
    customFieldMapping: process.env.CUSTOM_FIELD_MAPPING
        ? JSON.parse(process.env.CUSTOM_FIELD_MAPPING)
        : {
              connector: 'Коннектор',
              connector_2: 'Коннектор 2',
              storage_size: 'Хранилище Размер',
              functionality: 'Работоспособность',
              battery_chemistry: 'Химия Акб',
              battery_size: 'Размер Акб (Ah)',
              data_transfer: 'Передаёт данные?',
          },
}

// Validate required configuration
if (!config.snipeItToken) {
    console.error('ERROR: SNIPEIT_API_TOKEN environment variable is required')
    process.exit(1)
}

// Initialize Fastify with proper logging
const app = fastify({
    logger: {
        level: config.logLevel,
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
            },
        },
    },
})

// Register plugins
app.register(require('@fastify/formbody'))
app.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
})

// Health check endpoint
app.get('/health', async (request, reply) => {
    return { status: 'OK', timestamp: new Date().toISOString() }
})

// Main page route
app.get('/', (req, reply) => {
    reply.sendFile('index.html')
})

// Get all assets from Snipe-IT
app.get('/assets', async (request, reply) => {
    try {
        app.log.info('Fetching assets from Snipe-IT')
        const response = await axios.get(
            `${config.snipeItUrl}/api/v1/hardware?limit=${config.maxAssetsLimit}`,
            {
                headers: {
                    Authorization: `Bearer ${config.snipeItToken}`,
                    Accept: 'application/json',
                },
            },
        )

        app.log.info(`Retrieved ${response.data.rows.length} assets`)
        return response.data.rows
    } catch (error) {
        console.error(error)
        app.log.error(
            { error: error.message },
            'Failed to fetch assets from Snipe-IT',
        )

        if (error.response?.status === 401) {
            return reply
                .status(401)
                .send({ error: 'Invalid Snipe-IT API token' })
        }

        return reply.status(500).send({
            error: 'Failed to fetch assets from Snipe-IT',
            details: error.response?.data?.message || error.message,
        })
    }
})

// Generate batch PDF with multiple labels
app.post('/generate-batch', async (request, reply) => {
    const { asset_ids, template_type } = request.body

    if (!asset_ids || !template_type) {
        return reply.status(400).send({
            error: 'Missing required parameters: asset_ids and template_type',
        })
    }

    const assetIdArray = asset_ids
        .split(',')
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id))

    if (assetIdArray.length === 0) {
        return reply.status(400).send({
            error: 'No valid asset IDs provided',
        })
    }

    app.log.info(
        {
            asset_ids: assetIdArray,
            template_type,
            count: assetIdArray.length,
        },
        'Generating batch labels',
    )

    let browser
    try {
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            headless: 'new',
        })

        const pdfPages = []

        for (const assetId of assetIdArray) {
            try {
                // Fetch asset data from Snipe-IT
                const response = await axios.get(
                    `${config.snipeItUrl}/api/v1/hardware/${assetId}`,
                    {
                        headers: {
                            Authorization: `Bearer ${config.snipeItToken}`,
                            Accept: 'application/json',
                        },
                    },
                )
                const assetData = response.data

                let htmlContent
                let pageOptions = {}

                // Load and process template based on type (same logic as single generate)
                switch (template_type) {
                    case 'datamatrix':
                        htmlContent = await fs.readFile(
                            path.join(__dirname, 'template_datamatrix.html'),
                            'utf-8',
                        )
                        const pngBuffer = await bwipjs.toBuffer({
                            bcid: 'datamatrix',
                            text: assetData.asset_tag,
                            scale: 5,
                        })
                        htmlContent = htmlContent.replaceAll(
                            '{{datamatrix_image}}',
                            `data:image/png;base64,${pngBuffer.toString('base64')}`,
                        )
                        pageOptions = { width: 15, height: 15, unit: 'mm' }
                        break

                    case 'cable_flag':
                        htmlContent = await fs.readFile(
                            path.join(__dirname, 'template_cable_flag.html'),
                            'utf-8',
                        )
                        const cablePngBuffer = await bwipjs.toBuffer({
                            bcid: 'datamatrix',
                            text: assetData.asset_tag,
                            scale: 3,
                        })
                        htmlContent = htmlContent.replaceAll(
                            '{{datamatrix_image}}',
                            `data:image/png;base64,${cablePngBuffer.toString('base64')}`,
                        )
                        pageOptions = { width: 12, height: 40, unit: 'mm' }
                        break

                    case 'medium':
                        htmlContent = await fs.readFile(
                            path.join(__dirname, 'template_medium.html'),
                            'utf-8',
                        )
                        pageOptions = { width: 40, height: 30, unit: 'mm' }

                        const assetUrlMed = `${config.snipeItUrl}/hardware/${assetData.id}`
                        const qrPngBufferMed = await bwipjs.toBuffer({
                            bcid: 'qrcode',
                            text: assetUrlMed,
                            scale: 3,
                        })
                        htmlContent = htmlContent.replaceAll(
                            '{{qr_code_image}}',
                            `data:image/png;base64,${qrPngBufferMed.toString('base64')}`,
                        )

                        const barcodePngBufferMed = await bwipjs.toBuffer({
                            bcid: 'code128',
                            text: assetData.id.toString(),
                            scale: 3,
                            height: 4,
                            includetext: false,
                        })
                        htmlContent = htmlContent.replaceAll(
                            '{{barcode_image}}',
                            `data:image/png;base64,${barcodePngBufferMed.toString('base64')}`,
                        )
                        break

                    default:
                        htmlContent = await fs.readFile(
                            path.join(__dirname, 'template.html'),
                            'utf-8',
                        )
                        pageOptions = { width: 50, height: 25, unit: 'mm' }

                        const assetUrl = `${config.snipeItUrl}/hardware/${assetData.id}`
                        const qrPngBuffer = await bwipjs.toBuffer({
                            bcid: 'qrcode',
                            text: assetUrl,
                            scale: 3,
                        })
                        htmlContent = htmlContent.replaceAll(
                            '{{qr_code_image}}',
                            `data:image/png;base64,${qrPngBuffer.toString('base64')}`,
                        )

                        const barcodePngBuffer = await bwipjs.toBuffer({
                            bcid: 'code128',
                            text: assetData.id.toString(),
                            scale: 3,
                            height: 4,
                            includetext: false,
                        })
                        htmlContent = htmlContent.replaceAll(
                            '{{barcode_image}}',
                            `data:image/png;base64,${barcodePngBuffer.toString('base64')}`,
                        )
                        break
                }

                // Replace template variables with asset data (same as single generate)
                htmlContent = htmlContent.replaceAll(
                    /{{company_name}}/g,
                    config.companyName,
                )
                htmlContent = htmlContent.replaceAll(
                    /{{asset_tag}}/g,
                    assetData.asset_tag,
                )
                htmlContent = htmlContent.replaceAll(
                    /{{asset_name}}/g,
                    assetData.name || assetData.model.name,
                )
                htmlContent = htmlContent.replaceAll(
                    /{{first_line}}/g,
                    assetData.category.name,
                )
                htmlContent = htmlContent.replaceAll(
                    /{{second_line}}/g,
                    assetData.name ? assetData.name : assetData.model.name,
                )

                // Build third line from custom fields
                let thirdLine = ''
                const fields = assetData.custom_fields

                if (
                    fields[config.customFieldMapping.connector]?.value &&
                    fields[config.customFieldMapping.connector_2]?.value
                ) {
                    thirdLine +=
                        fields[config.customFieldMapping.connector].value +
                        ' | ' +
                        fields[config.customFieldMapping.connector_2].value +
                        ' '
                }

                if (fields[config.customFieldMapping.storage_size]?.value) {
                    thirdLine +=
                        fields[config.customFieldMapping.storage_size].value +
                        ' '
                }

                if (
                    fields[config.customFieldMapping.battery_chemistry]?.value
                ) {
                    thirdLine +=
                        fields[config.customFieldMapping.battery_chemistry]
                            .value + ' '
                }
                if (fields[config.customFieldMapping.battery_size]?.value) {
                    thirdLine +=
                        fields[config.customFieldMapping.battery_size].value +
                        ' '
                }

                htmlContent = htmlContent.replaceAll(
                    /{{third_line}}/g,
                    thirdLine || '—',
                )

                // Build fourth line
                let fourthLine = ''
                if (assetData.serial) {
                    fourthLine += 'S/N: ' + assetData.serial + ' '
                }

                const dataTransferField =
                    fields[config.customFieldMapping.data_transfer]
                if (dataTransferField) {
                    if (dataTransferField.value === 1) {
                        fourthLine += 'Data Transfer: Yes '
                    } else if (dataTransferField.value === 0) {
                        fourthLine += 'Data Transfer: No '
                    }
                }

                const functionalityField =
                    fields[config.customFieldMapping.functionality]
                if (
                    functionalityField?.value === 'Работает' &&
                    !assetData.serial
                ) {
                    fourthLine += 'Working '
                }

                htmlContent = htmlContent.replaceAll(
                    /{{fourth_line}}/g,
                    fourthLine || '—',
                )

                // Generate PDF for this asset
                const page = await browser.newPage()
                await page.setContent(htmlContent, {
                    waitUntil: 'networkidle0',
                })
                const pdfBuffer = await page.pdf({
                    width: `${pageOptions.width}mm`,
                    height: `${pageOptions.height}mm`,
                    printBackground: true,
                })
                await page.close()

                pdfPages.push(pdfBuffer)

                app.log.debug(`Generated label for asset ${assetId}`)
            } catch (assetError) {
                app.log.error(
                    {
                        error: assetError.message,
                        asset_id: assetId,
                    },
                    'Failed to generate label for asset in batch',
                )
                // Continue with other assets even if one fails
            }
        }

        if (pdfPages.length === 0) {
            return reply.status(500).send({
                error: 'Failed to generate any labels',
                details: 'No assets could be processed successfully',
            })
        }

        // Merge all PDFs into a single document using pdf-lib
        const mergedPdfDoc = await PDFDocument.create()

        for (const pdfBuffer of pdfPages) {
            const pdf = await PDFDocument.load(pdfBuffer)
            const pages = await mergedPdfDoc.copyPages(
                pdf,
                pdf.getPageIndices(),
            )
            pages.forEach((page) => mergedPdfDoc.addPage(page))
        }

        const mergedPdf = await mergedPdfDoc.save()

        const timestamp = new Date()
            .toISOString()
            .replaceAll(/[:.]/g, '-')
            .slice(0, -5)
        reply.header(
            'Content-Disposition',
            `attachment; filename="batch-${template_type}-${assetIdArray.length}assets-${timestamp}.pdf"`,
        )
        reply.type('application/pdf').send(mergedPdf)

        app.log.info(
            {
                asset_count: assetIdArray.length,
                generated_count: pdfPages.length,
                template_type,
            },
            'Batch labels generated successfully',
        )
    } catch (error) {
        app.log.error(
            {
                error: error.message,
                asset_ids: assetIdArray,
                template_type,
            },
            'Batch label generation failed',
        )

        return reply.status(500).send({
            error: 'Batch label generation failed',
            details: error.message,
        })
    } finally {
        if (browser) {
            await browser.close()
        }
    }
})

// Generate label (PDF or PNG preview)
app.post('/generate', async (request, reply) => {
    const { asset_id, template_type } = request.body

    if (!asset_id || !template_type) {
        return reply.status(400).send({
            error: 'Missing required parameters: asset_id and template_type',
        })
    }

    const wantsImage = request.headers['accept']?.includes('image/png')
    const outputFormat = wantsImage ? 'PNG' : 'PDF'

    app.log.info(
        {
            asset_id,
            template_type,
            output_format: outputFormat,
        },
        'Generating label',
    )

    let browser
    try {
        // Fetch asset data from Snipe-IT
        const response = await axios.get(
            `${config.snipeItUrl}/api/v1/hardware/${asset_id}`,
            {
                headers: {
                    Authorization: `Bearer ${config.snipeItToken}`,
                    Accept: 'application/json',
                },
            },
        )
        const assetData = response.data

        let htmlContent
        let pageOptions = {}

        // Load and process template based on type
        switch (template_type) {
            case 'datamatrix':
                htmlContent = await fs.readFile(
                    path.join(__dirname, 'template_datamatrix.html'),
                    'utf-8',
                )
                const pngBuffer = await bwipjs.toBuffer({
                    bcid: 'datamatrix',
                    text: assetData.asset_tag,
                    scale: 5,
                })
                htmlContent = htmlContent.replaceAll(
                    '{{datamatrix_image}}',
                    `data:image/png;base64,${pngBuffer.toString('base64')}`,
                )
                pageOptions = { width: 15, height: 15, unit: 'mm' }
                break

            case 'cable_flag':
                htmlContent = await fs.readFile(
                    path.join(__dirname, 'template_cable_flag.html'),
                    'utf-8',
                )
                const cablePngBufferBatch = await bwipjs.toBuffer({
                    bcid: 'datamatrix',
                    text: assetData.asset_tag,
                    scale: 3,
                })
                htmlContent = htmlContent.replaceAll(
                    '{{datamatrix_image}}',
                    `data:image/png;base64,${cablePngBufferBatch.toString('base64')}`,
                )
                pageOptions = { width: 12, height: 40, unit: 'mm' }
                break

            case 'medium':
                htmlContent = await fs.readFile(
                    path.join(__dirname, 'template_medium.html'),
                    'utf-8',
                )
                pageOptions = { width: 40, height: 30, unit: 'mm' }

                const assetUrlMed = `${config.snipeItUrl}/hardware/${assetData.id}`
                const qrPngBufferMed = await bwipjs.toBuffer({
                    bcid: 'qrcode',
                    text: assetUrlMed,
                    scale: 3,
                })
                htmlContent = htmlContent.replaceAll(
                    '{{qr_code_image}}',
                    `data:image/png;base64,${qrPngBufferMed.toString('base64')}`,
                )

                const barcodePngBufferMed = await bwipjs.toBuffer({
                    bcid: 'code128',
                    text: assetData.id.toString(),
                    scale: 3,
                    height: 4,
                    includetext: false,
                })
                htmlContent = htmlContent.replaceAll(
                    '{{barcode_image}}',
                    `data:image/png;base64,${barcodePngBufferMed.toString('base64')}`,
                )
                break

            default:
                htmlContent = await fs.readFile(
                    path.join(__dirname, 'template.html'),
                    'utf-8',
                )
                pageOptions = { width: 50, height: 25, unit: 'mm' }

                const assetUrl = `${config.snipeItUrl}/hardware/${assetData.id}`
                const qrPngBuffer = await bwipjs.toBuffer({
                    bcid: 'qrcode',
                    text: assetUrl,
                    scale: 3,
                })
                htmlContent = htmlContent.replaceAll(
                    '{{qr_code_image}}',
                    `data:image/png;base64,${qrPngBuffer.toString('base64')}`,
                )

                const barcodePngBuffer = await bwipjs.toBuffer({
                    bcid: 'code128',
                    text: assetData.id.toString(),
                    scale: 3,
                    height: 4,
                    includetext: false,
                })
                htmlContent = htmlContent.replaceAll(
                    '{{barcode_image}}',
                    `data:image/png;base64,${barcodePngBuffer.toString('base64')}`,
                )
                break
        }

        // Replace template variables with asset data
        htmlContent = htmlContent.replaceAll(
            /{{company_name}}/g,
            config.companyName,
        )
        htmlContent = htmlContent.replaceAll(
            /{{asset_tag}}/g,
            assetData.asset_tag,
        )
        htmlContent = htmlContent.replaceAll(
            /{{asset_name}}/g,
            assetData.name || assetData.model.name,
        )
        htmlContent = htmlContent.replaceAll(
            /{{first_line}}/g,
            assetData.category.name,
        )
        htmlContent = htmlContent.replaceAll(
            /{{second_line}}/g,
            assetData.name ? assetData.name : assetData.model.name,
        )

        // Build third line from custom fields
        let thirdLine = ''
        const fields = assetData.custom_fields

        // Cable connectors
        if (
            fields[config.customFieldMapping.connector]?.value &&
            fields[config.customFieldMapping.connector_2]?.value
        ) {
            thirdLine +=
                fields[config.customFieldMapping.connector].value +
                ' | ' +
                fields[config.customFieldMapping.connector_2].value +
                ' '
        }

        // Storage size
        if (fields[config.customFieldMapping.storage_size]?.value) {
            thirdLine +=
                fields[config.customFieldMapping.storage_size].value + ' '
        }

        // Battery information
        if (fields[config.customFieldMapping.battery_chemistry]?.value) {
            thirdLine +=
                fields[config.customFieldMapping.battery_chemistry].value + ' '
        }
        if (fields[config.customFieldMapping.battery_size]?.value) {
            thirdLine +=
                fields[config.customFieldMapping.battery_size].value + ' '
        }

        htmlContent = htmlContent.replaceAll(
            /{{third_line}}/g,
            thirdLine || '—',
        )

        // Build fourth line
        let fourthLine = ''
        if (assetData.serial) {
            fourthLine += 'S/N: ' + assetData.serial + ' '
        }

        // Data transfer capability
        const dataTransferField =
            fields[config.customFieldMapping.data_transfer]
        if (dataTransferField) {
            if (dataTransferField.value === 1) {
                fourthLine += 'Data Transfer: Yes '
            } else if (dataTransferField.value === 0) {
                fourthLine += 'Data Transfer: No '
            }
        }

        // Functionality status
        const functionalityField =
            fields[config.customFieldMapping.functionality]
        if (functionalityField?.value === 'Работает' && !assetData.serial) {
            fourthLine += 'Working '
        }

        htmlContent = htmlContent.replaceAll(
            /{{fourth_line}}/g,
            fourthLine || '—',
        )

        // Generate PDF or PNG using Puppeteer
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
            headless: 'new',
        })
        const page = await browser.newPage()

        if (wantsImage) {
            // Generate PNG preview
            await page.setViewport({
                width: Math.round(pageOptions.width * 3.78), // ~96 DPI conversion
                height: Math.round(pageOptions.height * 3.78),
            })
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' })
            const imageBuffer = await page.screenshot({ type: 'png' })

            reply.type('image/png').send(imageBuffer)
        } else {
            // Generate PDF
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' })
            const pdfBuffer = await page.pdf({
                width: `${pageOptions.width}mm`,
                height: `${pageOptions.height}mm`,
                printBackground: true,
            })

            const assetTag = assetData.asset_tag.replaceAll(
                /[^a-zA-Z0-9]/g,
                '-',
            )
            const assetName = (
                assetData.name ||
                assetData.model.name ||
                'asset'
            )
                .replaceAll(/[^a-zA-Z0-9]/g, '-')
                .substring(0, 30)
            reply.header(
                'Content-Disposition',
                `attachment; filename="label-${template_type}-${assetTag}-${assetName}.pdf"`,
            )
            reply.type('application/pdf').send(pdfBuffer)
        }

        app.log.info(
            {
                asset_id,
                template_type,
                output_format: outputFormat,
            },
            'Label generated successfully',
        )
    } catch (error) {
        app.log.error(
            {
                error: error.message,
                asset_id,
                template_type,
            },
            'Label generation failed',
        )

        if (error.response?.status === 404) {
            return reply.status(404).send({
                error: `Asset #${asset_id} not found`,
                details: 'The specified asset does not exist in Snipe-IT',
            })
        }

        return reply.status(500).send({
            error: 'Label generation failed',
            details: error.message,
        })
    } finally {
        if (browser) {
            await browser.close()
        }
    }
})

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
    app.log.info(`Received ${signal}, shutting down gracefully`)
    try {
        await app.close()
        process.exit(0)
    } catch (error) {
        app.log.error('Error during shutdown:', error)
        process.exit(1)
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

// Start server
const start = async () => {
    try {
        await app.listen({
            host: config.host,
            port: config.port,
        })

        app.log.info(
            {
                port: config.port,
                host: config.host,
                snipeItUrl: config.snipeItUrl,
                companyName: config.companyName,
            },
            'Server started successfully',
        )
    } catch (err) {
        app.log.error('Failed to start server:', err)
        process.exit(1)
    }
}

start()
