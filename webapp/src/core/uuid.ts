import { v4 as uuidv4, v7 as uuidv7 } from 'uuid'

export function newUuid(): string {
  return typeof uuidv7 === 'function' ? uuidv7() : uuidv4()
}
