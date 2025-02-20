/**
 * Script to generate api types from root.d.ts
 * This script extracts types from root.d.ts and creates a new api.d.ts file
 * with all internal types redefined for external use
 * Uses ts-morph to handle TypeScript AST transformations
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'

// @ts-ignore
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Define paths
const ROOT_DTS_PATH = path.resolve(__dirname, '../dist/root.d.ts')
const OUTPUT_PATH = path.resolve(__dirname, '../../sdk/types/api.d.ts')
const PACKAGES_ROOT = path.resolve(__dirname, '../../')

// Define special type definitions for external dependencies
const EXTERNAL_TYPE_DEFINITIONS = `export interface UserInfo {
  [key: string]: unknown
}
`

/**
 * Maps a @mindworld import path to actual file path in monorepo
 * Example: @mindworld/db/schema/app -> packages/db/src/schema/app.ts
 *          @mindworld/db/schema -> packages/db/src/schema/index.ts
 */
function resolveMonorepoPath(importPath: string): string {
  // Remove quotes and @mindworld prefix
  const cleanPath = importPath.replace(/["']/g, '').replace('@mindworld/', '')

  // Split into package name and subpath
  const [pkgName, ...subPaths] = cleanPath.split('/')

  // Construct base path
  const basePath = path.join(
    PACKAGES_ROOT,
    pkgName,
    'src',
    ...subPaths
  )

  // Try direct .ts file first
  const tsPath = basePath + '.ts'
  if (fs.existsSync(tsPath)) {
    return tsPath
  }

  // Try index.ts in directory
  const indexPath = path.join(basePath, 'index.ts')
  if (fs.existsSync(indexPath)) {
    return indexPath
  }

  // Return the .ts path as fallback (will fail fs.existsSync check later)
  return tsPath
}

// Helper function to extract type definitions from source files
async function extractTypeDefinition(importPath: string): Promise<string | null> {
  // Resolve the actual file path in monorepo
  const filePath = resolveMonorepoPath(importPath)

  if (!fs.existsSync(filePath)) {
    console.warn(`Source file not found: ${filePath}`)
    return null
  }

  const sourceContent = fs.readFileSync(filePath, 'utf-8')
  const parsedSourceFile = ts.createSourceFile(
    filePath,
    sourceContent,
    ts.ScriptTarget.Latest,
    true
  )

  let typeDefinition = ''

  // Visit each node to find type definitions
  function visit(node: ts.Node) {
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      // Get the type name
      const typeName = node.name.getText(parsedSourceFile)

      // Only extract the type if it matches one we're looking for
      if (mindworldImports.get(importPath)?.has(typeName)) {
        typeDefinition += sourceContent.slice(node.getStart(parsedSourceFile), node.getEnd()) + '\n\n'
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(parsedSourceFile)
  return typeDefinition
}

// Read and parse the root.d.ts file
const content = fs.readFileSync(ROOT_DTS_PATH, 'utf-8')
const rootSourceFile = ts.createSourceFile(
  'root.d.ts',
  content,
  ts.ScriptTarget.Latest,
  true
)

// Find all @mindworld imports and their type references
const mindworldImports = new Map<string, Set<string>>()
const typeReplacements = new Map<string, string>()

function visitNode(node: ts.Node) {
  if (ts.isImportTypeNode(node)) {
    const importPath = node.argument.getText(rootSourceFile)
    if (importPath.includes('@mindworld')) {
      // Skip DB client type
      if (importPath.includes('@mindworld/db/client')) {
        return
      }

      const qualifier = node.qualifier?.getText(rootSourceFile)
      if (qualifier) {
        const importKey = importPath
        if (!mindworldImports.has(importKey)) {
          mindworldImports.set(importKey, new Set())
        }
        mindworldImports.get(importKey)!.add(qualifier)

        // Create replacement mapping
        const fullType = `import(${importPath}).${qualifier}`
        typeReplacements.set(fullType, qualifier)
      }
    }
  }
  ts.forEachChild(node, visitNode)
}

visitNode(rootSourceFile)

// Extract type definitions for all found imports
let typeDefinitions = EXTERNAL_TYPE_DEFINITIONS + '\n'
// @ts-ignore
for (const [importPath, types] of mindworldImports) {
  // @ts-ignore
  const typeDef = await extractTypeDefinition(importPath)
  if (typeDef) {
    typeDefinitions += typeDef
  }
}

// Replace all @mindworld imports with our local type definitions
let output = content
// @ts-ignore
for (const [fullType, replacement] of typeReplacements) {
  output = output.replace(new RegExp(fullType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement)
}

// Replace external imports with our predefined types
output = output
  .replace(/import\("@clerk\/backend"\)\.User/g, 'UserInfo')
  .replace(/ctx: \{[^}]+\}/g, 'ctx: any')
  .replace(/export type AppRouter/g, 'export type API')
  .replace(/errorShape: \{[\s\S]*?data: \{[\s\S]*?\};[\s\S]*?\}/g, 'errorShape: import("@trpc/server").DefaultErrorShape')
  // Remove sourceMappingURL
  .replace(/\/\/# sourceMappingURL=.*$/m, '')

// Add our type definitions at the top of the file
const finalOutput = typeDefinitions + output

// Write the output file
fs.writeFileSync(OUTPUT_PATH, finalOutput)

console.log('Successfully generated api types')
