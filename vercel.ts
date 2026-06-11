import { routes, type VercelConfig } from '@vercel/config/v1'

export const config: VercelConfig = {
    framework: 'vite',
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
    functions: {
        'api/**/*.ts': {
            maxDuration: 10
        }
    },
    rewrites: [
        routes.rewrite('/api/(.*)', '/api/$1'),
        routes.rewrite('/(.*)', '/index.html')
    ]
}
