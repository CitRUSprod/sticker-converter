import { Telegraf, Context } from "telegraf"
import { message } from "telegraf/filters"
import ffmpeg from "fluent-ffmpeg"
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg"
import { ConvertibleFile } from "$/utils"

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN!

const bot = new Telegraf(telegramBotToken)

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

bot.start(async ctx => {
    await ctx.reply("Send a file to be turned into a sticker")
})

bot.on(message("photo"), async ctx => {
    await ctx.reply("Better yet, send an uncompressed image so the stickers turn out better!")
})

async function mediaHandler<T extends Context>(
    ctx: T,
    fileId: string,
    fileName: string | undefined
) {
    if (fileName && ConvertibleFile.isAllowedFile(fileName)) {
        await ctx.reply("Processing...")

        const url = await bot.telegram.getFileLink(fileId)
        const cf = await ConvertibleFile.download(url.toString(), fileName)

        try {
            await cf.convert("telegram-sticker")
            await cf.convert("telegram-emoji")

            const result = await cf.getResult()

            await ctx.replyWithDocument(result)
            await ctx.reply("Done")
        } catch (err) {
            console.error(err)
            await ctx.reply("There was an error")
        }

        await cf.remove()
    } else {
        await ctx.reply("Unsupported file format")
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

bot.launch(() => {
    console.log("Telegram bot started")
})

process.once("SIGINT", () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))
