import type { Dispatch, SetStateAction } from 'react'
import { memo } from 'react'
import { toast } from 'sonner'

import { Button } from '@mindworld/ui/components/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@mindworld/ui/components/tooltip'

import type { ConsoleOutput, UIBlock } from './block'
import { useMultimodalCopyToClipboard } from '@/hooks/use-multimodal-copy-to-clipboard'
import { cn } from '@/lib/utils'
import { ClockRewind, CopyIcon, RedoIcon, UndoIcon } from './icons'
import { RunCodeButton } from './run-code-button'

interface BlockActionsProps {
  block: UIBlock
  handleVersionChange: (type: 'next' | 'prev' | 'toggle' | 'latest') => void
  currentVersionIndex: number
  isCurrentVersion: boolean
  mode: 'read-only' | 'edit' | 'diff'
  setConsoleOutputs: Dispatch<SetStateAction<ConsoleOutput[]>>
}

function PureBlockActions({
  block,
  handleVersionChange,
  currentVersionIndex,
  isCurrentVersion,
  mode,
  setConsoleOutputs,
}: BlockActionsProps) {
  const { copyTextToClipboard, copyImageToClipboard } = useMultimodalCopyToClipboard()

  return (
    <div className="flex flex-row gap-1">
      {block.kind === 'code' && (
        <RunCodeButton block={block} setConsoleOutputs={setConsoleOutputs} />
      )}

      {block.kind === 'text' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className={cn('p-2 h-fit !pointer-events-auto dark:hover:bg-zinc-700', {
                'bg-muted': mode === 'diff',
              })}
              onClick={() => {
                handleVersionChange('toggle')
              }}
              disabled={block.status === 'streaming' || currentVersionIndex === 0}
            >
              <ClockRewind size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>View changes</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            className="p-2 h-fit dark:hover:bg-zinc-700 !pointer-events-auto"
            onClick={() => {
              handleVersionChange('prev')
            }}
            disabled={currentVersionIndex === 0 || block.status === 'streaming'}
          >
            <UndoIcon size={18} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>View Previous version</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            className="p-2 h-fit dark:hover:bg-zinc-700 !pointer-events-auto"
            onClick={() => {
              handleVersionChange('next')
            }}
            disabled={isCurrentVersion || block.status === 'streaming'}
          >
            <RedoIcon size={18} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>View Next version</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            className="p-2 h-fit dark:hover:bg-zinc-700"
            onClick={() => {
              if (block.kind === 'image') {
                void copyImageToClipboard(block.content)
              } else {
                void copyTextToClipboard(block.content)
              }

              toast.success('Copied to clipboard!')
            }}
            disabled={block.status === 'streaming'}
          >
            <CopyIcon size={18} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy to clipboard</TooltipContent>
      </Tooltip>
    </div>
  )
}

export const BlockActions = memo(PureBlockActions, (prevProps, nextProps) => {
  if (prevProps.block.status !== nextProps.block.status) return false
  if (prevProps.currentVersionIndex !== nextProps.currentVersionIndex) return false
  if (prevProps.isCurrentVersion !== nextProps.isCurrentVersion) return false

  return true
})