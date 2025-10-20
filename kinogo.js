class KinogoPlugin {
    constructor() {
        this.name = 'Kinogo.ec'
        this.version = '1.0.0'
        this.logo = 'https://www.google.com/s2/favicons?domain=kinogo.ec&sz=32'
        
        this.supported = {
            movie: true,
            serial: true
        }
    }

    init() {
        this.cache = {}
        console.log('Kinogo Plugin initialized')
    }

    async search(keyword) {
        try {
            const searchUrl = `https://kinogo.ec/index.php?do=search&subaction=search&story=${encodeURIComponent(keyword)}`
            
            const html = await this.request(searchUrl)
            const results = this.parseSearch(html)
            
            return results
        } catch (error) {
            console.error('Search error:', error)
            return []
        }
    }

    parseSearch(html) {
        const results = []
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')
        
        const items = doc.querySelectorAll('.shortstory')
        
        items.forEach(item => {
            try {
                const titleElem = item.querySelector('.short-title a')
                const posterElem = item.querySelector('.short-poster img')
                const linkElem = item.querySelector('.short-title a')
                const infoElem = item.querySelector('.short-in')
                
                if (!titleElem || !linkElem) return
                
                const title = titleElem.textContent.trim()
                const poster = posterElem ? posterElem.src : ''
                const url = linkElem.href
                const info = infoElem ? infoElem.textContent : ''
                
                // Определяем тип контента
                const isSerial = title.toLowerCase().includes('сезон') || 
                               title.toLowerCase().includes('серия') ||
                               info.toLowerCase().includes('сезон') ||
                               info.toLowerCase().includes('серия')
                
                results.push({
                    id: url,
                    name: title,
                    cover: poster,
                    description: info,
                    type: isSerial ? 'serial' : 'movie'
                })
            } catch (e) {
                console.error('Error parsing search item:', e)
            }
        })
        
        return results
    }

    async item(data) {
        try {
            const html = await this.request(data.id)
            return this.parseItem(html, data)
        } catch (error) {
            console.error('Item error:', error)
            return data
        }
    }

    parseItem(html, data) {
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')
        
        // Получаем описание
        const descriptionElem = doc.querySelector('.fstory-in')
        if (descriptionElem) {
            data.description = descriptionElem.textContent.trim()
        }
        
        // Получаем постер
        const posterElem = doc.querySelector('.fposter img')
        if (posterElem && posterElem.src) {
            data.cover = posterElem.src
        }
        
        // Получаем год и страну
        const infoElems = doc.querySelectorAll('.fstory-in .misc')
        infoElems.forEach(elem => {
            const text = elem.textContent.toLowerCase()
            if (text.includes('год:')) {
                data.year = parseInt(text.replace('год:', '').trim())
            }
            if (text.includes('страна:')) {
                data.country = text.replace('страна:', '').trim()
            }
        })
        
        // Парсим ссылки на просмотр
        data.links = this.parseLinks(html)
        
        return data
    }

    parseLinks(html) {
        const links = []
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')
        
        // Ищем iframe с видео
        const iframes = doc.querySelectorAll('iframe')
        
        iframes.forEach((iframe, index) => {
            if (iframe.src && iframe.src.includes('//')) {
                links.push({
                    name: `Источник ${index + 1}`,
                    url: iframe.src
                })
            }
        })
        
        // Ищем ссылки в плеерах
        const playerLinks = doc.querySelectorAll('[data-link]')
        playerLinks.forEach((link, index) => {
            const url = link.getAttribute('data-link')
            if (url && url.includes('//')) {
                links.push({
                    name: `Плеер ${index + 1}`,
                    url: url
                })
            }
        })
        
        return links
    }

    async source(data) {
        try {
            if (!data.links || data.links.length === 0) {
                throw new Error('No links found')
            }
            
            // Используем первую доступную ссылку
            const link = data.links[0]
            
            return {
                source: link.url,
                quality: 'auto',
                name: link.name,
                type: 'video/mp4',
                headers: {
                    'Referer': 'https://kinogo.ec/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        } catch (error) {
            console.error('Source error:', error)
            throw error
        }
    }

    async request(url, options = {}) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15000)
        
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
                    'Referer': 'https://kinogo.ec/'
                },
                signal: controller.signal,
                ...options
            })
            
            clearTimeout(timeout)
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }
            
            return await response.text()
        } catch (error) {
            clearTimeout(timeout)
            throw error
        }
    }
}

// Регистрация плагина
Lampa.Plugin.register(new KinogoPlugin())

// Добавление в список источников
Lampa.Plugin.add({
    name: 'kinogo-plugin',
    version: '1.0.0',
    init: function() {
        console.log('Kinogo plugin loaded successfully')
    }
})
// V2.2
