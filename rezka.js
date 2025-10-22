// Плагин для поиска фильмов на rezka.ag для Lampa
// Добавить в файл plugins.js или создать отдельный плагин

class RezkaPlugin {
    constructor(){
        this.name = 'Rezka.ag'
        this.description = 'Поиск фильмов и сериалов на Rezka.ag'
        this.version = '1.0'
        this.type = 'search'
        this.icon = 'https://rezka.ag/favicon.ico'
    }

    search(query){
        return new Promise((resolve, reject) => {
            let results = []
            
            // Кодируем запрос для URL
            let encodedQuery = encodeURIComponent(query)
            
            // URL для поиска на rezka.ag
            let searchUrl = `https://rezka.ag/search/?do=search&subaction=search&q=${encodedQuery}`
            
            // Используем Lampa для выполнения запроса
            Lampa.Request.json(searchUrl, (json)=>{
                // Парсим результаты
                this.parseSearchResults(json).then(parsedResults=>{
                    resolve(parsedResults)
                }).catch(error=>{
                    reject(error)
                })
            }, (error)=>{
                reject(error)
            })
        })
    }

    parseSearchResults(html){
        return new Promise((resolve, reject) => {
            try {
                let results = []
                
                // Создаем временный DOM элемент для парсинга
                let parser = new DOMParser()
                let doc = parser.parseFromString(html, 'text/html')
                
                // Ищем элементы с результатами поиска
                let items = doc.querySelectorAll('.b-content__inline_item')
                
                items.forEach(item => {
                    try {
                        let result = {
                            title: '',
                            year: '',
                            description: '',
                            poster: '',
                            url: '',
                            type: 'movie' // или 'tv'
                        }
                        
                        // Извлекаем заголовок
                        let titleElem = item.querySelector('.b-content__inline_item-link a')
                        if(titleElem) {
                            result.title = titleElem.textContent.trim()
                            result.url = titleElem.href
                        }
                        
                        // Извлекаем год
                        let yearElem = item.querySelector('.b-content__inline_item-link div')
                        if(yearElem) {
                            let yearText = yearElem.textContent.trim()
                            let yearMatch = yearText.match(/(\d{4})/)
                            if(yearMatch) result.year = yearMatch[1]
                        }
                        
                        // Извлекаем постер
                        let posterElem = item.querySelector('.b-content__inline_item-cover img')
                        if(posterElem) {
                            result.poster = posterElem.src
                        }
                        
                        // Определяем тип контента (фильм или сериал)
                        let typeElem = item.querySelector('.b-content__inline_item-type')
                        if(typeElem) {
                            let typeText = typeElem.textContent.trim().toLowerCase()
                            if(typeText.includes('сериал')) {
                                result.type = 'tv'
                            }
                        }
                        
                        if(result.title && result.url) {
                            results.push(result)
                        }
                    } catch(e) {
                        console.error('Error parsing item:', e)
                    }
                })
                
                resolve(results)
            } catch(error) {
                reject(error)
            }
        })
    }

    extractVideoUrl(pageUrl){
        return new Promise((resolve, reject) => {
            Lampa.Request.json(pageUrl, (html)=>{
                try {
                    // Парсим страницу для извлечения видео URL
                    let parser = new DOMParser()
                    let doc = parser.parseFromString(html, 'text/html')
                    
                    // Ищем iframe с видео
                    let iframe = doc.querySelector('#video_player iframe')
                    if(iframe) {
                        resolve(iframe.src)
                    } else {
                        // Альтернативный метод поиска видео
                        let scripts = doc.querySelectorAll('script')
                        scripts.forEach(script => {
                            let scriptText = script.textContent
                            if(scriptText.includes('poster') && scriptText.includes('file')) {
                                // Парсим JSON с информацией о видео
                                let match = scriptText.match(/\{[\s\S]*?"poster"[^}]*\}/)
                                if(match) {
                                    try {
                                        let videoData = JSON.parse(match[0])
                                        if(videoData.file) {
                                            resolve(videoData.file)
                                            return
                                        }
                                    } catch(e) {
                                        console.error('Error parsing video data:', e)
                                    }
                                }
                            }
                        })
                        reject('Video URL not found')
                    }
                } catch(error) {
                    reject(error)
                }
            }, reject)
        })
    }

    // Метод для воспроизведения
    play(item){
        this.extractVideoUrl(item.url).then(videoUrl=>{
            // Создаем объект для воспроизведения в Lampa
            let playerItem = {
                title: item.title,
                url: videoUrl,
                poster: item.poster,
                quality: 'auto'
            }
            
            // Запускаем воспроизведение
            Lampa.Player.play(playerItem)
        }).catch(error=>{
            Lampa.Noty.show('Ошибка загрузки видео: ' + error)
        })
    }
}

// Регистрируем плагин
Lampa.Plugin.register('rezka_search', RezkaPlugin)

// Добавляем плагин в поиск
Lampa.Plugin.add({
    name: 'rezka-search',
    title: 'Rezka.ag',
    group: 'search',
    version: '1.0',
    component: RezkaPlugin
})
