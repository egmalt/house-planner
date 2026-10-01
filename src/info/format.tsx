import type { ComponentProps } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Table } from '../ui'
import { fmtDate, isUrl } from './util'

const plugins = [remarkGfm]

const ExtLink = ({ node: _node, ...props }: ComponentProps<'a'> & { node?: unknown }) => <a {...props} target="_blank" rel="noreferrer" />

const blockComponents: Components = {
  a: ExtLink,
  table: ({ node: _node, ...props }) => (
    <div className="info-frame">
      <Table {...props} />
    </div>
  ),
  h1: ({ node: _node, ...props }) => <h3 className="info-block__title info-block__title--sub" {...props} />,
  h2: ({ node: _node, ...props }) => <h3 className="info-block__title info-block__title--sub" {...props} />,
  h3: ({ node: _node, ...props }) => <h4 className="info-md__h4" {...props} />,
}

const inlineComponents: Components = {
  a: ExtLink,
  p: ({ children }) => <>{children}</>,
}

export function Md({ text }: { text: string }) {
  return (
    <div className="info-md">
      <Markdown remarkPlugins={plugins} components={blockComponents}>
        {text}
      </Markdown>
    </div>
  )
}

export function Rich({ text }: { text: string }) {
  return (
    <Markdown remarkPlugins={plugins} components={inlineComponents}>
      {text}
    </Markdown>
  )
}

export function Cell({ value }: { value: string }) {
  if (isUrl(value)) {
    let host = value
    try {
      host = new URL(value).hostname.replace(/^www\./, '')
    } catch {
      host = value
    }
    return (
      <a href={value} target="_blank" rel="noreferrer">
        {host}
      </a>
    )
  }
  return <Rich text={/^\d{4}-\d{2}-\d{2}$/.test(value) ? fmtDate(value) : value} />
}
