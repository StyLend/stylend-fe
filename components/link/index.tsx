'use client'

import NextLink from 'next/link'
import { useMemo, type ReactNode, type Ref, type AnchorHTMLAttributes } from 'react'

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string
  children?: ReactNode
  className?: string
  scroll?: boolean
  shallow?: boolean
  ref?: Ref<HTMLAnchorElement>
}

export function Link({
  href,
  children,
  className,
  scroll,
  shallow,
  ref,
  ...props
}: LinkProps) {
  const attributes = {
    ref,
    className,
    ...props,
  }

  const isProtocol = useMemo(
    () => href?.startsWith('mailto:') || href?.startsWith('tel:'),
    [href]
  )

  const isAnchor = useMemo(() => href?.startsWith('#'), [href])
  const isExternal = useMemo(() => href?.startsWith('http'), [href])

  if (typeof href !== 'string') {
    return <button {...(attributes as Record<string, unknown>)}>{children}</button>
  }

  if (isProtocol || isExternal) {
    return (
      <a {...attributes} href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  }

  return (
    <NextLink
      href={href}
      passHref={isAnchor}
      scroll={scroll}
      {...attributes}
    >
      {children}
    </NextLink>
  )
}
