'use client'

import cn from 'clsx'
import { Link } from '@/components/link'
import ArrowDiagonal from '@/icons/ArrowDiagonal'
import s from './button.module.css'
import type { ReactNode, CSSProperties } from 'react'

interface ButtonProps {
  icon?: ReactNode
  arrow?: boolean
  children?: ReactNode
  href?: string
  onClick?: () => void
  className?: string
  style?: CSSProperties
}

export const Button = ({
  icon,
  arrow,
  children,
  href,
  onClick,
  className,
  style,
}: ButtonProps) => {
  return href ? (
    <Link
      href={href}
      className={cn(s.button, className, icon && s['has-icon'])}
      style={style}
    >
      {icon && <span className={s.icon}>{icon}</span>}
      <span className={s.text}>
        <span className={s.visible}>
          {children} {arrow && <ArrowDiagonal className={cn(s.arrow, 'icon')} />}
        </span>
        <span aria-hidden="true" className={s.hidden}>
          {children} {arrow && <ArrowDiagonal className={cn(s.arrow, 'icon')} />}
        </span>
      </span>
    </Link>
  ) : (
    <button
      type="button"
      className={cn(s.button, className, icon && s['has-icon'])}
      style={style}
      onClick={onClick}
    >
      {icon && <span className={s.icon}>{icon}</span>}
      <span className={s.text}>
        <span className={s.visible}>
          {children} {arrow && <ArrowDiagonal className={cn(s.arrow, 'icon')} />}
        </span>
        <span aria-hidden="true" className={s.hidden}>
          {children} {arrow && <ArrowDiagonal className={cn(s.arrow, 'icon')} />}
        </span>
      </span>
    </button>
  )
}
