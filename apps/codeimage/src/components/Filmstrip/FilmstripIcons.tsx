import type {SvgIconProps} from '@codeimage/ui';
import {SvgIcon} from '@codeimage/ui';

/** Two overlapping cards — "duplicate slide". */
export function DuplicateIcon(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M7 3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H7Zm0 1.5h6a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5Z" />
      <path d="M3.5 6.5A.75.75 0 0 1 4.25 7v6.5A1.5 1.5 0 0 0 5.75 15h5.5a.75.75 0 0 1 0 1.5h-5.5A3 3 0 0 1 2.75 13.5V7a.75.75 0 0 1 .75-.5Z" />
    </SvgIcon>
  );
}

/** Trash can — "delete slide". */
export function TrashIcon(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path
        fill-rule="evenodd"
        d="M8.75 1a1 1 0 0 0-.96.71L7.5 2.5H4.25a.75.75 0 0 0 0 1.5h.31l.63 10.13A2 2 0 0 0 7.49 16h5.02a2 2 0 0 0 2-1.87L15.14 4h.31a.75.75 0 0 0 0-1.5H12.2l-.29-.79A1 1 0 0 0 10.96 1H8.75Zm-.87 4.75a.75.75 0 0 1 .79.71l.25 5a.75.75 0 0 1-1.5.08l-.25-5a.75.75 0 0 1 .71-.79Zm4.24 0a.75.75 0 0 1 .71.79l-.25 5a.75.75 0 1 1-1.5-.08l.25-5a.75.75 0 0 1 .79-.71Z"
        clip-rule="evenodd"
      />
    </SvgIcon>
  );
}
