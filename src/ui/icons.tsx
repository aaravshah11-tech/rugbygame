/** Line-art mode icons, drawn large and faded behind the menu tiles. */
type IconProps = { className?: string };

const S = (props: IconProps & { children: React.ReactNode }) => (
  <svg className={props.className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {props.children}
  </svg>
);

/** rugby posts */
export const IconPosts = (p: IconProps) => (
  <S {...p}>
    <path d="M18 6v52M46 6v52M18 30h28" />
    <ellipse cx="32" cy="46" rx="8" ry="5" transform="rotate(-25 32 46)" />
  </S>
);
export const IconTrophy = (p: IconProps) => (
  <S {...p}>
    <path d="M20 8h24v14a12 12 0 0 1-24 0z" />
    <path d="M20 13H11a8 8 0 0 0 9 11M44 13h9a8 8 0 0 1-9 11" />
    <path d="M32 34v10M22 56h20M25 56l2-12h10l2 12" />
  </S>
);
export const IconShield = (p: IconProps) => (
  <S {...p}>
    <path d="M32 6l22 8v16c0 14-10 24-22 28C20 54 10 44 10 30V14z" />
    <path d="M32 18v28M20 30h24" />
  </S>
);
export const IconCrown = (p: IconProps) => (
  <S {...p}>
    <path d="M8 46l4-28 12 12 8-18 8 18 12-12 4 28z" />
    <path d="M10 54h44" />
  </S>
);
export const IconGlobe = (p: IconProps) => (
  <S {...p}>
    <circle cx="32" cy="32" r="24" />
    <path d="M8 32h48M32 8c-8 8-8 40 0 48M32 8c8 8 8 40 0 48M14 18h36M14 46h36" />
  </S>
);
export const IconCards = (p: IconProps) => (
  <S {...p}>
    <rect x="8" y="14" width="26" height="38" rx="4" transform="rotate(-10 21 33)" />
    <rect x="28" y="10" width="26" height="38" rx="4" transform="rotate(8 41 29)" />
    <path d="M37 22l4 6 6-2-3 6 4 5-7-1-3 6-1-7-6-2 6-3z" strokeWidth={2.2} />
  </S>
);
export const IconTarget = (p: IconProps) => (
  <S {...p}>
    <circle cx="32" cy="32" r="24" />
    <circle cx="32" cy="32" r="14" />
    <circle cx="32" cy="32" r="4" />
    <path d="M50 14l-14 14M50 14v-6M50 14h6" />
  </S>
);
export const IconBoot = (p: IconProps) => (
  <S {...p}>
    <path d="M14 10h16v20l20 8c4 2 6 5 6 9v3H10z" />
    <path d="M10 50h46M16 56v-6M26 56v-6M36 56v-6M46 56v-6M18 22h8" />
  </S>
);
export const IconWhistle = (p: IconProps) => (
  <S {...p}>
    <path d="M10 30a14 14 0 1 0 28 0h18V20H24a14 14 0 0 0-14 10z" />
    <circle cx="24" cy="30" r="4" />
    <path d="M46 14v6M8 12l6 4" />
  </S>
);
export const IconGear = (p: IconProps) => (
  <S {...p}>
    <circle cx="32" cy="32" r="8" />
    <path d="M32 6v8M32 50v8M6 32h8M50 32h8M13.6 13.6l5.7 5.7M44.7 44.7l5.7 5.7M13.6 50.4l5.7-5.7M44.7 19.3l5.7-5.7" />
    <circle cx="32" cy="32" r="18" />
  </S>
);
export const IconGift = (p: IconProps) => (
  <S {...p}>
    <rect x="10" y="24" width="44" height="30" rx="3" />
    <path d="M6 16h52v8H6zM32 16v38M32 16c-4-10-16-10-14-2 1 3 8 2 14 2M32 16c4-10 16-10 14-2-1 3-8 2-14 2" />
  </S>
);
