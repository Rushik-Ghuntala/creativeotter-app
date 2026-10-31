import { deleteCookie, getCookie, hasCookie, setCookie } from "cookies-next"
import jwt from "jsonwebtoken"

export interface JwtToken {
  iss: string
  aud: string
  auth_time: number
  user_id: string
  sub: string
  iat: number
  exp: number
  email: string
  email_verified: boolean
  firebase: {
    identities: {
      email: string[]
    }
    sign_in_provider: string
  }
}

export const fetchCookie = (key: string, defaultValue?: string) => {
  if (getCookie(key)?.toString()) {
    return getCookie(key)
  }
  return defaultValue
}

export const addCookie = (key: string, value: string) => {
  setCookie(key, value, { maxAge: 86400 }) // 24hrs expiration
}

export const haveCookie = (key: string) => hasCookie(key)

export const removeCookie = (key: string) => deleteCookie(key)

export const verifyAccessToken = (): JwtToken | null => {
  const token = fetchCookie("accessToken")
  const currentPath = window.location.pathname

  if (currentPath.includes("/user/") || currentPath.includes("/onboarding/")) {
    let decoded
    try {
      decoded = jwt.decode(token as string) as JwtToken
    } catch {
      decoded = null
    }
    if (!decoded) {
      document.cookie = "accessToken=; Max-Age=0; path=/"
      window.location.href = "/auth/login"
      return null
    } else {
      return decoded
    }
  }

  return null
}
