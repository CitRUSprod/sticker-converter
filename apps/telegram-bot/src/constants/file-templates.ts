interface FileTemplate {
    format: string
    resolution: number
    fps: number
    duration: number
    maxSizeKB: number
    square: boolean
}

type FileTemplates = Record<string, { name: string; static: FileTemplate; dynamic: FileTemplate }>

export const fileTemplates = {
    "telegram-sticker": {
        name: "Telegram Stickers",
        static: {
            format: "webm",
            resolution: 512,
            fps: 4,
            duration: 3,
            maxSizeKB: 256,
            square: false
        },
        dynamic: {
            format: "webm",
            resolution: 512,
            fps: 30,
            duration: 3,
            maxSizeKB: 256,
            square: false
        }
    },
    "telegram-emoji": {
        name: "Telegram Emojis",
        static: {
            format: "webm",
            resolution: 100,
            fps: 4,
            duration: 3,
            maxSizeKB: 64,
            square: true
        },
        dynamic: {
            format: "webm",
            resolution: 100,
            fps: 30,
            duration: 3,
            maxSizeKB: 64,
            square: true
        }
    }
} as const satisfies FileTemplates
