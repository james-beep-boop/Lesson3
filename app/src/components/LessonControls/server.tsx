import React from 'react'
import type { BeforeDocumentControlsServerProps } from 'payload'

import { systemFlagsForRender } from '../../lib/systemFlags'
import LessonControls from './index'

/**
 * The version edit view's controls, registered as `beforeDocumentControls`: a server wrapper so
 * `LessonControls` (a client component) receives the system flags — the one thing it cannot read itself —
 * as a prop. It passes ALL of them, so the next flag a control needs is a prop read, not another wrapper.
 * Everything else `LessonControls` still takes from Payload's document and auth hooks.
 */
export default async function LessonControlsServer({ payload }: BeforeDocumentControlsServerProps) {
  return <LessonControls flags={await systemFlagsForRender(payload)} />
}
