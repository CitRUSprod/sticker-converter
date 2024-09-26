export const staticMediaFiles = [".png", ".jpg"] as const

export const dynamicMediaFiles = [".gif", ".mp4", ".webm"] as const

export const mediaFiles = [...staticMediaFiles, ...dynamicMediaFiles] as const

export const archiveFiles = [".zip"] as const

export const allowedFiles = [...mediaFiles, ...archiveFiles] as const
