'use client'

import { useCallback, useRef, useState } from 'react'
import {
  useEditor,
  useEditorState,
  EditorContent,
  type Editor,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import LinkExtension from '@tiptap/extension-link'
import ImageExtension from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Youtube from '@tiptap/extension-youtube'
import {
  MAX_VIDEOS_PER_POST,
  validateVideoUploadInput,
} from '@/lib/richtext/video-upload'
import {
  uploadForumVideo,
  type VideoUploadProgress,
} from '@/lib/richtext/video-upload-client'
import { normalizeVideoEmbedUrl } from '@/lib/richtext/video-url'
import { createLocalVideoNode, LocalVideo } from './local-video-extension'
import { Vimeo } from './vimeo-extension'

type Props = {
  content: string
  onChange: (json: unknown, html: string, text: string) => void
  placeholder?: string
  localVideoUploadEnabled: boolean
  localVideoApprovedOrigin: string | null
  onVideoUploadStateChange?: (pending: boolean) => void
  onLocalVideoCountChange?: (count: number) => void
}

type MenuButtonProps = {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}

function MenuButton({ onClick, active, disabled, title, children }: MenuButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: active ? '#e0e7ff' : 'transparent',
        border: '1px solid',
        borderColor: active ? '#6366f1' : '#e2e8f0',
        borderRadius: 6,
        padding: '4px 8px',
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        color: active ? '#4338ca' : '#475569',
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}

const VIDEO_PHASE_LABEL = {
  reserving: 'Authorizing upload…',
  uploading: 'Uploading video…',
  finalizing: 'Verifying video…',
} as const

export function countLocalVideos(editor: Editor): number {
  let count = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'localVideo') count += 1
  })
  return count
}

function Toolbar({
  editor,
  localVideoUploadEnabled,
  onVideoUploadStateChange,
}: {
  editor: Editor
  localVideoUploadEnabled: boolean
  onVideoUploadStateChange?: (pending: boolean) => void
}) {
  const [linkUrl, setLinkUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [videoUpload, setVideoUpload] = useState<VideoUploadProgress | null>(null)
  const { localVideoCount, localVideoSelected } = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      localVideoCount: countLocalVideos(currentEditor),
      localVideoSelected: currentEditor.isActive('localVideo'),
    }),
  })
  const videoUploading = videoUpload !== null

  const addLink = useCallback(() => {
    if (linkUrl) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run()
      setLinkUrl('')
      setShowLinkInput(false)
    }
  }, [editor, linkUrl])

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    const formData = new FormData()
    for (const file of files) {
      formData.append('files', file)
    }

    try {
      const res = await fetch('/api/admin/forum/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      const uploaded = data.data?.uploaded as Array<{ url: string; filename: string }> | undefined
      if (!uploaded?.length) throw new Error('The upload returned no image')

      for (const item of uploaded) {
        editor.chain().focus().setImage({ src: item.url, alt: item.filename }).run()
      }
    } catch (err) {
      alert('Upload failed: ' + String(err))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [editor])

  const addYoutubeVideo = useCallback(() => {
    const url = prompt('Enter YouTube URL:')
    if (!url) return

    const video = normalizeVideoEmbedUrl(url)
    if (!video || video.provider !== 'youtube') {
      alert('Invalid YouTube URL')
      return
    }

    editor.commands.setYoutubeVideo({ src: video.src, width: 640, height: 360 })
  }, [editor])

  const addVimeoVideo = useCallback(() => {
    const url = prompt('Enter Vimeo URL:')
    if (!url) return

    const video = normalizeVideoEmbedUrl(url)
    if (!video || video.provider !== 'vimeo') {
      alert('Invalid Vimeo URL')
      return
    }

    editor.chain().focus().insertContent({
      type: 'vimeo',
      attrs: { src: video.src, width: 640, height: 360 },
    }).run()
  }, [editor])

  const handleVideoUpload = useCallback(async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!localVideoUploadEnabled) {
      alert('Local video upload is currently disabled.')
      event.target.value = ''
      return
    }

    const validation = validateVideoUploadInput({
      name: file.name,
      declaredMime: file.type,
      size: file.size,
    })
    if (!validation.ok) {
      alert(validation.error)
      event.target.value = ''
      return
    }

    if (countLocalVideos(editor) >= MAX_VIDEOS_PER_POST) {
      alert(`A post may contain at most ${MAX_VIDEOS_PER_POST} local videos.`)
      event.target.value = ''
      return
    }

    setVideoUpload({ phase: 'reserving', percent: 0 })
    onVideoUploadStateChange?.(true)

    try {
      const video = await uploadForumVideo(file, { onProgress: setVideoUpload })
      if (countLocalVideos(editor) >= MAX_VIDEOS_PER_POST) {
        throw new Error(
          `The video was finalized, but the post already contains ${MAX_VIDEOS_PER_POST} local videos`,
        )
      }

      const inserted = editor
        .chain()
        .focus()
        .insertContent([
          createLocalVideoNode(video),
          { type: 'paragraph' },
        ])
        .run()
      if (!inserted) {
        throw new Error('The video was finalized but could not be inserted into the editor')
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unexpected video upload error'
      alert(`Video upload failed: ${message}`)
    } finally {
      setVideoUpload(null)
      onVideoUploadStateChange?.(false)
      if (videoInputRef.current) videoInputRef.current.value = ''
    }
  }, [editor, localVideoUploadEnabled, onVideoUploadStateChange])

  const removeSelectedVideo = useCallback(() => {
    if (!editor.isActive('localVideo')) return
    editor.chain().focus().deleteSelection().run()
  }, [editor])

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 4,
      padding: '8px 12px',
      borderBottom: '1px solid #e2e8f0',
      background: '#f8fafc',
      borderRadius: '8px 8px 0 0',
      alignItems: 'center',
    }}>
      <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
        H1
      </MenuButton>
      <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
        H2
      </MenuButton>
      <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
        H3
      </MenuButton>

      <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />

      <MenuButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
        <strong>B</strong>
      </MenuButton>
      <MenuButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
        <em>I</em>
      </MenuButton>
      <MenuButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
        <span style={{ textDecoration: 'underline' }}>U</span>
      </MenuButton>
      <MenuButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
        <span style={{ textDecoration: 'line-through' }}>S</span>
      </MenuButton>

      <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />

      <MenuButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
        {String.fromCharCode(8220)}
      </MenuButton>
      <MenuButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
        •≡
      </MenuButton>
      <MenuButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered List">
        1.
      </MenuButton>
      <MenuButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code Block">
        {'</>'}
      </MenuButton>

      <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />

      <MenuButton onClick={() => setShowLinkInput(!showLinkInput)} active={editor.isActive('link')} title="Link">
        🔗
      </MenuButton>

      <MenuButton
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        title="Insert Image"
      >
        {uploading ? '...' : '🖼'}
      </MenuButton>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        style={{ display: 'none' }}
        onChange={handleImageUpload}
      />

      <MenuButton
        onClick={() => videoInputRef.current?.click()}
        disabled={
          !localVideoUploadEnabled
          || videoUploading
          || localVideoCount >= MAX_VIDEOS_PER_POST
        }
        title={
          !localVideoUploadEnabled
            ? 'Local video upload is currently disabled'
            : localVideoCount >= MAX_VIDEOS_PER_POST
            ? `Maximum ${MAX_VIDEOS_PER_POST} local videos reached`
            : 'Upload MP4 or WebM video (maximum 50 MB)'
        }
      >
        {videoUploading
          ? 'Uploading…'
          : localVideoUploadEnabled
            ? 'Upload Video'
            : 'Video Upload Disabled'}
      </MenuButton>
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,.mp4,.webm"
        disabled={!localVideoUploadEnabled || videoUploading}
        style={{ display: 'none' }}
        onChange={handleVideoUpload}
      />

      {localVideoSelected ? (
        <MenuButton
          onClick={removeSelectedVideo}
          title="Remove selected local video"
        >
          Remove Video
        </MenuButton>
      ) : null}

      <MenuButton onClick={addYoutubeVideo} title="YouTube">
        ▶️
      </MenuButton>
      <MenuButton onClick={addVimeoVideo} title="Vimeo">
        Ⓥ
      </MenuButton>

      {showLinkInput && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 4 }}>
          <input
            value={linkUrl}
            aria-label="Link URL"
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            onKeyDown={(e) => { if (e.key === 'Enter') addLink() }}
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 13,
              width: 200,
            }}
          />
          <button
            type="button"
            onClick={addLink}
            style={{
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Add
          </button>
        </div>
      )}

      {videoUpload ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'grid',
            gridTemplateColumns: 'max-content minmax(120px, 1fr) 42px',
            alignItems: 'center',
            gap: 8,
            flexBasis: '100%',
            marginTop: 4,
            color: '#475569',
            fontSize: 12,
          }}
        >
          <span>{VIDEO_PHASE_LABEL[videoUpload.phase]}</span>
          <progress
            aria-label="Video upload progress"
            max={100}
            value={videoUpload.percent}
            style={{ width: '100%' }}
          />
          <span>{videoUpload.percent}%</span>
        </div>
      ) : null}
    </div>
  )
}

export default function TipTapEditor({
  content,
  onChange,
  placeholder,
  localVideoUploadEnabled,
  localVideoApprovedOrigin,
  onVideoUploadStateChange,
  onLocalVideoCountChange,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
        underline: false,
      }),
      Underline,
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      ImageExtension.configure({
        HTMLAttributes: { loading: 'lazy' },
      }),
      Youtube.configure({
        inline: false,
        nocookie: true,
        allowFullscreen: true,
        width: 640,
        height: 360,
        HTMLAttributes: { class: 'video-embed-frame' },
      }),
      Vimeo,
      LocalVideo.configure({ approvedOrigin: localVideoApprovedOrigin }),
      Placeholder.configure({
        placeholder: placeholder || 'Write something...',
      }),
    ],
    content,
    immediatelyRender: false,
    onCreate: ({ editor }) => {
      onChange(editor.getJSON(), editor.getHTML(), editor.getText())
      onLocalVideoCountChange?.(countLocalVideos(editor))
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON()
      const html = editor.getHTML()
      const text = editor.getText()
      onChange(json, html, text)
      onLocalVideoCountChange?.(countLocalVideos(editor))
    },
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
      },
    },
  })

  if (!editor) return null

  return (
    <div style={{
      border: '1px solid #cbd5e1',
      borderRadius: 8,
      overflow: 'hidden',
      background: '#fff',
    }}>
      <Toolbar
        editor={editor}
        localVideoUploadEnabled={localVideoUploadEnabled}
        onVideoUploadStateChange={onVideoUploadStateChange}
      />
      <EditorContent
        editor={editor}
        style={{
          padding: '16px',
          minHeight: 300,
          maxHeight: 600,
          overflowY: 'auto',
        }}
      />
      <style>{`
        .tiptap-editor {
          outline: none;
          min-height: 300px;
        }
        .tiptap-editor p {
          margin: 0 0 8px;
          line-height: 1.7;
        }
        .tiptap-editor h1 { font-size: 24px; font-weight: 800; margin: 16px 0 8px; }
        .tiptap-editor h2 { font-size: 20px; font-weight: 700; margin: 14px 0 6px; }
        .tiptap-editor h3 { font-size: 17px; font-weight: 600; margin: 12px 0 6px; }
        .tiptap-editor ul, .tiptap-editor ol { padding-left: 24px; margin: 8px 0; }
        .tiptap-editor li { margin: 4px 0; }
        .tiptap-editor blockquote {
          border-left: 3px solid #3b82f6;
          margin: 12px 0;
          padding: 8px 16px;
          background: #f8fafc;
          color: #475569;
          font-style: italic;
        }
        .tiptap-editor pre {
          background: #1e293b;
          color: #e2e8f0;
          border-radius: 8px;
          padding: 12px 16px;
          overflow-x: auto;
          font-size: 13px;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
          margin: 12px 0;
        }
        .tiptap-editor code {
          background: #f1f5f9;
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 0.9em;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
        }
        .tiptap-editor pre code {
          background: none;
          padding: 0;
          border-radius: 0;
        }
        .tiptap-editor a {
          color: #3b82f6;
          text-decoration: underline;
        }
        .tiptap-editor img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 12px 0;
        }
        .tiptap-editor video[data-forum-video] {
          display: block;
          width: 100%;
          max-width: 100%;
          height: auto;
          margin: 12px 0;
          border-radius: 8px;
          background: #0f172a;
        }
        .tiptap-editor video[data-forum-video].ProseMirror-selectednode {
          outline: 3px solid #6366f1;
          outline-offset: 2px;
        }
        .tiptap-editor hr {
          border: none;
          border-top: 1px solid #e2e8f0;
          margin: 20px 0;
        }
        .tiptap-editor p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
          float: left;
          height: 0;
        }
        .tiptap-editor [data-youtube-video],
        .tiptap-editor [data-vimeo-video] {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          margin: 12px 0;
        }
        .tiptap-editor [data-youtube-video] iframe,
        .tiptap-editor [data-vimeo-video] iframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          border-radius: 8px;
        }
      `}</style>
    </div>
  )
}
