import { UnstructuredEtl } from './unstructured'

async function main() {
  const r = await fetch('https://pub-ff9819f3864a477387e8f2bd7edd73a4.r2.dev/Archmage-for-Sui.pdf')
  const data = await (await r.blob()).bytes()
  const result = await new UnstructuredEtl().extract(data, 'am%20%E9%97%AE%E9%A2%98.txt')
  console.log({ text: result.join('\n\n') })
}

await main()
