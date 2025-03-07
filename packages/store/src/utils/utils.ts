import { toBase64 } from 'lib0/buffer.js';
import * as Y from 'yjs';
import type { z } from 'zod';

import { SYS_KEYS } from '../consts.js';
import { native2Y } from '../reactive/index.js';
import type { BaseBlockModel } from '../schema/base.js';
import { type BlockSchema } from '../schema/base.js';
import { internalPrimitives } from '../schema/base.js';
import type { YBlock } from '../workspace/block/block.js';
import type { Workspace } from '../workspace/index.js';
import type { BlockProps, YBlocks } from '../workspace/page.js';

export function assertValidChildren(
  yBlocks: YBlocks,
  props: Partial<BlockProps>
) {
  if (!Array.isArray(props.children)) return;

  props.children.forEach(child => {
    if (!yBlocks.has(child.id)) {
      throw new Error('Invalid child id: ' + child.id);
    }
  });
}

export function syncBlockProps(
  schema: z.infer<typeof BlockSchema>,
  model: BaseBlockModel,
  yBlock: YBlock,
  props: Partial<BlockProps>
) {
  const defaultProps = schema.model.props?.(internalPrimitives) ?? {};

  Object.entries(props).forEach(([key, value]) => {
    if (SYS_KEYS.has(key)) return;
    if (value === undefined) return;

    // @ts-ignore
    model[key] = value;
  });

  // set default value
  Object.entries(defaultProps).forEach(([key, value]) => {
    const notExists =
      !yBlock.has(`prop:${key}`) || yBlock.get(`prop:${key}`) === undefined;
    if (!notExists) {
      return;
    }

    // @ts-ignore
    model[key] = native2Y(value);
  });
}

export function encodeWorkspaceAsYjsUpdateV2(workspace: Workspace): string {
  return toBase64(Y.encodeStateAsUpdateV2(workspace.doc));
}
