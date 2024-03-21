class Auth {
    public username: string
    public password: string

    static instance: Auth;

    private constructor() {
        this.username = ""
        this.password = ""
    }

    public static getInstance() {
        if (!Auth.instance) {
            console.log('creating new auth')
            Auth.instance = new Auth();
        }
        return Auth.instance;
    }
}

var _clientAuthCleanRequested: boolean

export function setAuth(username: string, password: string) {
    console.log('auth set to ' + username + ":" + password)
    Auth.getInstance().username = username
    Auth.getInstance().password = password
}

export function cleanAuth() {
    console.log('cleaning auth')
    setAuth("", "")
}

export function getAuthUsername() {
    console.log('auth now is ' + Auth.getInstance().username + ":" + Auth.getInstance().username)
    return Auth.getInstance().username
}

export function getAuthPassword() {
    return Auth.getInstance().password
}

export function requestClientAuthClean() {
    _clientAuthCleanRequested = true
}

export function setClientAuthCleaned() {
    _clientAuthCleanRequested = false
}

export function isClientAuthCleanRequested() {
    return _clientAuthCleanRequested
}