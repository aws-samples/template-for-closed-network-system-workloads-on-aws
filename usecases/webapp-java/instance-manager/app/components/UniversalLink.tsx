import { type ComponentProps } from 'react';
import { Link } from '@remix-run/react';

export const universalLinkStyle = 'text-solid-gray-800 text-dns-16N-130 underline underline-offset-[calc(3/16em)] hover:decoration-[calc(3/16+1rem)] focus-visible:rounded-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:outline-offset-4';

export type UniversalLinkProps = ComponentProps<typeof Link> & {
  asChild?: boolean;
  className?: string;
  showIcon?: boolean;
};

export const UniversalLink = (props: UniversalLinkProps) => {
  const { asChild, children, className, showIcon, ...rest } = props;

  if (asChild) {
    return (
      <Link className={`${universalLinkStyle} ${className ?? ''}`} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <Link className={`${universalLinkStyle} ${className ?? ''}`} {...rest}>
      {children}
      {props.target === '_blank' && showIcon && <UniversalLinkExternalLinkIcon />}
    </Link>
  );
};

export type UniversalLinkExternalLinkIconProps = ComponentProps<'svg'>;

export const UniversalLinkExternalLinkIcon = (props: UniversalLinkExternalLinkIconProps) => {
  const { className, ...rest } = props;

  return (
    <svg
      aria-label={`${rest['aria-label'] ?? '新規タブで開きます'}`}
      role='img'
      className={`ml-1 inline-block align-[–0.15em] ${className ?? ''}`}
      fill='none'
      height='16'
      viewBox='0 0 48 48'
      width='16'
    >
      <path
        className={className ?? ''}
        d='M22 6V9H39V26H42V6H22ZM22 42V26H26V39H39V26H42V42H22Z'
        fill='currentColor'
      />
    </svg>
  );
};

export default UniversalLink;
