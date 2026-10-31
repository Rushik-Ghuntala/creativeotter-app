export const isServer = typeof window === "undefined"

export const setDataInLocalStorage = (key: string, data: unknown): void => {
  if (!isServer) {
    localStorage.setItem(key, JSON.stringify(data))
  }
}

export const getDataFromLocalStorage = (key: string): unknown => {
  if (!isServer) {
    const storedData = localStorage.getItem(key)
    return storedData ? JSON.parse(storedData) : null
  }
  return null
}

export const removeDataFromLocalStorage = (key: string): void => {
  if (!isServer) {
    localStorage.removeItem(key)
  }
}

export const hasDataInLocalStorage = (key: string): boolean => {
  if (!isServer) {
    return localStorage.getItem(key) !== null
  }
  return false
}
