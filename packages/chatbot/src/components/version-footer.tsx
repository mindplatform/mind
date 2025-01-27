'use client'

import { useState } from 'react'
import { isAfter } from 'date-fns'
import { motion } from 'framer-motion'
import { useSWRConfig } from 'swr'
import { useWindowSize } from 'usehooks-ts'

import type { Document } from '@mindworld/db/schema'
import { Button } from '@mindworld/ui/components/button'

import { useBlock } from '@/hooks/use-block'
import { getDocumentTimestampByIndex } from '@/lib/utils'
import { LoaderIcon } from './icons'

interface VersionFooterProps {
  handleVersionChange: (type: 'next' | 'prev' | 'toggle' | 'latest') => void
  documents: Document[] | undefined
  currentVersionIndex: number
}

export const VersionFooter = ({
  handleVersionChange,
  documents,
  currentVersionIndex,
}: VersionFooterProps) => {
  const { block } = useBlock()

  const { width } = useWindowSize()
  const isMobile = width < 768

  const { mutate } = useSWRConfig()
  const [isMutating, setIsMutating] = useState(false)

  if (!documents) return

  return (
    <motion.div
      className="absolute flex flex-col gap-4 lg:flex-row bottom-0 bg-background p-4 w-full border-t z-50 justify-between"
      initial={{ y: isMobile ? 200 : 77 }}
      animate={{ y: 0 }}
      exit={{ y: isMobile ? 200 : 77 }}
      transition={{ type: 'spring', stiffness: 140, damping: 20 }}
    >
      <div>
        <div>You are viewing a previous version</div>
        <div className="text-muted-foreground text-sm">Restore this version to make edits</div>
      </div>

      <div className="flex flex-row gap-4">
        <Button
          disabled={isMutating}
          onClick={async () => {
            setIsMutating(true)

            void mutate(
              `/api/document?id=${block.documentId}`,
              await fetch(`/api/document?id=${block.documentId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  timestamp: getDocumentTimestampByIndex(documents, currentVersionIndex),
                }),
              }),
              {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                optimisticData: documents
                  ? [
                      ...documents.filter((document) =>
                        isAfter(
                          new Date(document.createdAt),
                          new Date(getDocumentTimestampByIndex(documents, currentVersionIndex)),
                        ),
                      ),
                    ]
                  : [],
              },
            )
          }}
        >
          <div>Restore this version</div>
          {isMutating && (
            <div className="animate-spin">
              <LoaderIcon />
            </div>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            handleVersionChange('latest')
          }}
        >
          Back to latest version
        </Button>
      </div>
    </motion.div>
  )
}