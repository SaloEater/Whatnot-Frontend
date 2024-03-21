var _username: string
var _password: string
var _authCleanRequested: boolean

export function SetAuth(username: string, password: string) {
    localStorage.setItem('username', username)
    localStorage.setItem('password', password)
    _username = username
    _password = password
}

export function CleanAuth() {
    localStorage.removeItem('username')
    localStorage.removeItem('password')
    _username = ""
    _password = ""
}

export function getAuthUsername() {
    return _username
}

export function getAuthPassword() {
    return _password
}

export function requestAuthClean() {
    _authCleanRequested = true
}

export function setAuthCleaned() {
    _authCleanRequested = false
}

export function isAuthCleanRequested() {
    return _authCleanRequested
}