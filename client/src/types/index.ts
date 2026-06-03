export interface User {
    _id: string
    name: string
    email: string
    createdAt: string
}

export interface ApiResponse<T> {
    data: T
    message: string
}
