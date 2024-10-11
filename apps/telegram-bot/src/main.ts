import { Telegraf, Context } from "telegraf"
import { message } from "telegraf/filters"
import ffmpeg from "fluent-ffmpeg"
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg"
import * as constants from "$/constants"
import { ConvertibleFile } from "$/utils"

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN!

const bot = new Telegraf(telegramBotToken)

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

const allowedFileFormatsMessage = `Allowed file formats: <i>${constants.mediaFiles.join(", ")}</i>.\n\nYou can also send an archive (<i>${constants.archiveFiles.join(", ")}</i>) with files of an allowed format inside.`
const helpMessage = `Send the file to turn it into a sticker.\n\n${allowedFileFormatsMessage}`

bot.start(async ctx => {
    await ctx.reply(helpMessage, { parse_mode: "HTML" })
})

bot.help(async ctx => {
    await ctx.reply(helpMessage, { parse_mode: "HTML" })
})

bot.on(message("photo"), async ctx => {
    await ctx.reply("Better yet, send an uncompressed image so the stickers turn out better!")
})

async function mediaHandler<T extends Context>(
    ctx: T,
    fileId: string,
    fileName: string | undefined
) {
    const fileMessageId = ctx.message!.message_id

    if (fileName && ConvertibleFile.isAllowedFile(fileName)) {
        await ctx.reply("Processing...", {
            reply_parameters: {
                message_id: fileMessageId
            }
        })

        const url = await bot.telegram.getFileLink(fileId)
        const cf = await ConvertibleFile.download(url.toString(), fileName)

        try {
            await cf.convert("telegram-sticker")
            await cf.convert("telegram-emoji")

            const result = await cf.getResult()

            await ctx.replyWithDocument(result, {
                caption: "Result",
                reply_parameters: {
                    message_id: fileMessageId
                }
            })
        } catch (err) {
            console.error(err)
            await ctx.reply("An unknown error has occurred", {
                reply_parameters: {
                    message_id: fileMessageId
                }
            })
        }

        await cf.remove()
    } else {
        await ctx.reply(`Unsupported file format!\n\n${allowedFileFormatsMessage}`, {
            parse_mode: "HTML",
            reply_parameters: {
                message_id: fileMessageId
            }
        })
    }
}

bot.on(message("document"), async ctx => {
    const { file_id: fileId, file_name: fileName } = ctx.message.document
    await mediaHandler(ctx, fileId, fileName)
})

bot.on(message("video"), async ctx => {
    const { file_id: fileId, file_name: fileName } = ctx.message.video
    await mediaHandler(ctx, fileId, fileName)
})

bot.catch(async (err, ctx) => {
    console.error(err)

    const messageId = ctx.message?.message_id

    if (messageId) {
        await ctx.reply("An unknown error has occurred", {
            reply_parameters: {
                message_id: messageId
            }
        })
    }
})

await ConvertibleFile.removeAll()

bot.launch(() => {
    console.log("Telegram bot started")
})

process.once("SIGINT", () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))
