export function cartLineId(product){return product.variantId?`${product.id}:variant:${product.variantId}`:product.batchId?`${product.id}:batch:${product.batchId}`:product.id;}
