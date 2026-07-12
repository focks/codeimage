import type {SvgIconProps} from '@codeimage/ui';
import {SvgIcon} from '@codeimage/ui';

export const FilmIcon = (props: SvgIconProps) => {
  return (
    <SvgIcon fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width={2}
        d="M7 4v16M17 4v16M3 8h4M3 16h4M17 8h4M17 16h4M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z"
      />
    </SvgIcon>
  );
};
