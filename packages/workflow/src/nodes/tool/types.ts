import type { CollectionType } from '@/app/components/tools/types'
import type { CommonNodeType, ValueSelector } from '@/types'

export enum VarType {
  variable = 'variable',
  constant = 'constant',
  mixed = 'mixed',
}

export type ToolVarInputs = Record<string, {
  type: VarType
  value?: string | ValueSelector
}>

export type ToolNodeType = CommonNodeType & {
  provider_id: string
  provider_type: CollectionType
  provider_name: string
  tool_name: string
  tool_label: string
  tool_parameters: ToolVarInputs
  tool_configurations: Record<string, any>
}
