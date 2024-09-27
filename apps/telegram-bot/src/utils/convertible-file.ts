import path from "path"
import fs from "fs-extra"
import { fileURLToPath } from "url"
import { v4 as createUuid } from "uuid"
import { Input } from "telegraf"
import ffmpeg from "fluent-ffmpeg"
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg"
import ffprobeInstaller from "@ffprobe-installer/ffprobe"
import AdmZip from "adm-zip"
import * as constants from "$/constants"

interface FileMetadata {
    size: number
    width: number
    height: number
    duration: number
    fps: number
    bitrate: number
}

interface FfmpegParams {
    input: string
    output: string
    outputFormat: string
    fps?: number
    size?: string
    duration?: number
    bitrate?: number
    speed?: number
}

const dirname = path.dirname(fileURLToPath(import.meta.url))

ffmpeg.setFfmpegPath(ffmpegInstaller.path)
ffmpeg.setFfprobePath(ffprobeInstaller.path)

const archiveFolder = "_archive"

function getAbsFilesPath(...paths: Array<string>) {
    return path.join(
        dirname,
        `../../..${process.env.IS_DOCKER_CONTAINER ? "" : "/storage"}/files`,
        ...paths
    )
}

function getExtension(filePath: string) {
    return path.extname(filePath).toLowerCase()
}

function setExtension(filePath: string, extension: string) {
    const ext = getExtension(filePath)
    return `${filePath.slice(0, -ext.length)}${extension}`
}

function isStaticMediaFile(fileName: string) {
    return constants.staticMediaFiles.includes(getExtension(fileName))
}

function isMediaFile(fileName: string) {
    return constants.mediaFiles.includes(getExtension(fileName))
}

function isArchiveFile(fileName: string) {
    return constants.archiveFiles.includes(getExtension(fileName))
}

function isAllowedFile(fileName: string) {
    return constants.allowedFiles.includes(getExtension(fileName))
}

function getFilesInDir(dirPath: string) {
    let result: Array<string> = []

    const files = fs.readdirSync(dirPath)

    for (const file of files) {
        const filePath = path.join(dirPath, file)

        if (fs.statSync(filePath).isDirectory()) {
            result = [...result, ...getFilesInDir(filePath)]
        } else {
            result.push(filePath)
        }
    }

    return result
}

export class ConvertibleFile {
    private readonly _inputFileName: string
    private readonly _outputFileName: string
    private readonly _path: string
    private readonly _inputDirPath: string
    private readonly _outputDirPath: string

    private constructor(inputFileName: string) {
        const uuid = createUuid()

        const correctGifFileName = inputFileName.replace(/\.gif\.mp4$/i, ".gif")
        const ext = getExtension(correctGifFileName)

        this._inputFileName = setExtension(correctGifFileName, ext)
        this._outputFileName = setExtension(this._inputFileName, ".zip")
        this._path = getAbsFilesPath(uuid)
        this._inputDirPath = path.join(this._path, "input")
        this._outputDirPath = path.join(this._path, "output")
    }

    private _zip() {
        return new Promise<void>((resolve, reject) => {
            const zip = new AdmZip()
            const archivePath = path.join(this._outputDirPath, archiveFolder)
            const files = getFilesInDir(archivePath)

            for (const file of files) {
                zip.addLocalFile(file, path.dirname(file.slice(archivePath.length + 1)))
            }

            zip.writeZip(path.join(this._outputDirPath, this._outputFileName), err => {
                if (err) {
                    reject(err)
                } else {
                    resolve()
                }
            })
        })
    }

    private _unzip() {
        return new Promise<void>((resolve, reject) => {
            if (isArchiveFile(this._inputFileName)) {
                const inputFilePath = path.join(this._inputDirPath, this._inputFileName)
                const zip = new AdmZip(inputFilePath)
                zip.extractAllToAsync(
                    path.join(this._inputDirPath, archiveFolder),
                    false,
                    true,
                    err => {
                        if (err) {
                            reject(err)
                        } else {
                            resolve()
                        }
                    }
                )
            } else {
                resolve()
            }
        })
    }

    private _getMetadata(filePath: string) {
        return new Promise<FileMetadata>((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) {
                    reject(err)
                } else {
                    const size = (metadata.format.size ?? 0) / 1024

                    const videoStream = metadata.streams.find(
                        stream => stream.codec_type === "video"
                    )

                    if (!videoStream) {
                        reject(new Error("No video stream found"))
                        return
                    }

                    const { width = 0, height = 0 } = videoStream

                    let duration = 0

                    if (typeof metadata.format.duration === "number") {
                        duration = metadata.format.duration
                    }

                    let fps = 0

                    if (duration > 0 && videoStream.r_frame_rate) {
                        fps = parseFloat(videoStream.r_frame_rate)
                    }

                    let bitrate = 0

                    if (typeof metadata.format.bit_rate === "number") {
                        bitrate = metadata.format.bit_rate / 1024
                    }

                    resolve({ size, width, height, duration, fps, bitrate })
                }
            })
        })
    }

    private _ffmpegConvert(params: FfmpegParams) {
        return new Promise<void>((resolve, reject) => {
            const ffmpegCommand = ffmpeg()

            if (params.fps) {
                ffmpegCommand.fps(params.fps)
            }

            if (params.size) {
                ffmpegCommand.size(params.size)
            }

            if (params.duration) {
                ffmpegCommand.duration(params.duration)
            }

            if (params.bitrate) {
                ffmpegCommand.videoBitrate(params.bitrate)
            }

            if (params.speed) {
                ffmpegCommand.videoFilter(`setpts=${1 / params.speed}*PTS`)
            }

            ffmpegCommand
                .input(params.input)
                .output(params.output)
                .outputFormat(params.outputFormat)
                .outputOptions(["-pix_fmt yuva420p", "-crf 0", "-auto-alt-ref 0"])
                .videoCodec("libvpx-vp9")
                .noAudio()
                .on("end", () => {
                    resolve()
                })
                .on("error", err => {
                    reject(err)
                })
                .run()
        })
    }

    private async _compress(filePath: string, templateKey: keyof typeof constants.fileTemplates) {
        if (isMediaFile(filePath)) {
            const template = constants.fileTemplates[templateKey]
            const templateType = template[isStaticMediaFile(filePath) ? "static" : "dynamic"]

            const metadata = await this._getMetadata(filePath)

            if (metadata.size > templateType.maxSizeKB) {
                await this._ffmpegConvert({
                    input: filePath,
                    output: `${filePath}_`,
                    bitrate: Math.round(metadata.bitrate * 0.8),
                    outputFormat: templateType.format
                })

                await fs.remove(filePath)
                await fs.move(`${filePath}_`, filePath)

                await this._compress(filePath, templateKey)
            }
        }
    }

    private async _convert(
        relativeFilePath: string,
        templateKey: keyof typeof constants.fileTemplates
    ) {
        if (isMediaFile(relativeFilePath)) {
            const template = constants.fileTemplates[templateKey]
            const templateType =
                template[isStaticMediaFile(relativeFilePath) ? "static" : "dynamic"]

            const outputFilePath = path.join(
                this._outputDirPath,
                archiveFolder,
                template.name,
                setExtension(relativeFilePath, `.${templateType.format}`)
            )

            await fs.ensureDir(path.dirname(outputFilePath))

            let inputFilePath: string

            if (isArchiveFile(this._inputFileName)) {
                inputFilePath = path.join(this._inputDirPath, archiveFolder, relativeFilePath)
            } else {
                inputFilePath = path.join(this._inputDirPath, this._inputFileName)
            }

            const metadata = await this._getMetadata(inputFilePath)

            const ratio = metadata.width / metadata.height

            let width: number
            let height: number

            if (
                metadata.width > templateType.resolution ||
                metadata.height > templateType.resolution
            ) {
                if (metadata.width > metadata.height) {
                    width = templateType.resolution
                    height = Math.round(width / ratio)
                } else {
                    height = templateType.resolution
                    width = Math.round(height * ratio)
                }
            } else {
                width = metadata.width
                height = metadata.height
            }

            const fps =
                metadata.fps === 0 || metadata.fps > templateType.fps
                    ? templateType.fps
                    : metadata.fps

            const duration =
                metadata.duration > templateType.duration
                    ? templateType.duration
                    : metadata.duration

            let speed = 1

            if (metadata.duration > templateType.duration) {
                speed = metadata.duration / templateType.duration
            }

            await this._ffmpegConvert({
                input: inputFilePath,
                output: outputFilePath,
                fps,
                size: `${width}x${height}`,
                duration,
                bitrate: 1024,
                speed,
                outputFormat: templateType.format
            })

            await this._compress(outputFilePath, templateKey)
        }
    }

    public static isAllowedFile(fileName: string) {
        return isAllowedFile(fileName)
    }

    public static async download(url: string, fileName: string) {
        if (this.isAllowedFile(fileName)) {
            const cf = new this(fileName)

            const res = await fetch(url)
            const arrayBuffer = await res.arrayBuffer()
            await fs.outputFile(
                path.join(cf._inputDirPath, cf._inputFileName),
                Buffer.from(arrayBuffer)
            )

            await cf._unzip()

            return cf
        } else {
            throw new Error(`File "${fileName}" is not allowed`)
        }
    }

    public async convert(templateKey: keyof typeof constants.fileTemplates) {
        if (isArchiveFile(this._inputFileName)) {
            const archivePath = path.join(this._inputDirPath, archiveFolder)
            const files = getFilesInDir(archivePath)
                .filter(f => isMediaFile(f))
                .map(f => f.slice(archivePath.length + 1))

            for (const file of files) {
                await this._convert(file, templateKey)
            }
        } else {
            await this._convert(this._inputFileName, templateKey)
        }
    }

    public async getResult() {
        await this._zip()
        const stream = fs.createReadStream(path.join(this._outputDirPath, this._outputFileName))
        return Input.fromReadableStream(stream, this._outputFileName)
    }

    public async remove() {
        await fs.remove(this._path)
    }
}
