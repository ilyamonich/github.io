(function(plugin) {
    plugin.info = {
        title: 'Kinogo.media Source',
        description: 'Источник фильмов и сериалов с kinogo.media',
        version: '1.0.0',
        author: 'Lampa Plugin Developer'
    };

    plugin.init = function() {
        console.log('Kinogo.media plugin initializing...');
        
        if (window.Sources) {
            setupKinogoSource();
        } else {
            // Ждем загрузки Sources
            let attempts = 0;
            const maxAttempts = 50;
            
            const waitForSources = setInterval(() => {
                attempts++;
                if (window.Sources) {
                    clearInterval(waitForSources);
                    setupKinogoSource();
                } else if (attempts >= maxAttempts) {
                    clearInterval(waitForSources);
                    console.error('Sources not found after ' + maxAttempts + ' attempts');
                }
            }, 100);
        }
    };

    function setupKinogoSource() {
        Sources.kinogo = {
            title: 'Kinogo.media',
            menu: true,
            search: true,
            year: true,
            sort: true,
            adult: false,
            
            // Основной URL
            url: 'https://kinogo.media/',
            
            // Категории
            groups: [
                {title: 'Фильмы', url: 'filmy-2024'},
                {title: 'Сериалы', url: 'serialy-2024'},
                {title: 'Мультфильмы', url: 'multfilmy-2024'},
                {title: 'Аниме', url: 'anime-2024'},
                {title: 'Новинки', url: 'novye-filmy'}
            ],

            // Поиск
            search: function(query) {
                return new Promise((resolve) => {
                    const searchUrl = this.url + 'index.php?do=search&subaction=search&story=' + encodeURIComponent(query);
                    
                    this.makeRequest(searchUrl)
                        .then(html => {
                            const results = this.parseSearchResults(html);
                            resolve({
                                success: true,
                                results: results
                            });
                        })
                        .catch(error => {
                            resolve({
                                success: false,
                                error: error.message
                            });
                        });
                });
            },

            // Получение списка контента по категории
            group: function(url) {
                return new Promise((resolve) => {
                    const groupUrl = this.url + url + '/';
                    
                    this.makeRequest(groupUrl)
                        .then(html => {
                            const results = this.parseGroupResults(html);
                            resolve({
                                success: true,
                                results: results
                            });
                        })
                        .catch(error => {
                            resolve({
                                success: false,
                                error: error.message
                            });
                        });
                });
            },

            // Получение информации о фильме/сериале
            movie: function(url) {
                return new Promise((resolve) => {
                    this.makeRequest(url)
                        .then(html => {
                            const result = this.parseMovieDetails(html);
                            resolve({
                                success: true,
                                movie: result
                            });
                        })
                        .catch(error => {
                            resolve({
                                success: false,
                                error: error.message
                            });
                        });
                });
            },

            // Парсинг результатов поиска
            parseSearchResults: function(html) {
                const results = [];
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                const items = doc.querySelectorAll('.shortstory');
                
                items.forEach(item => {
                    try {
                        const titleElem = item.querySelector('.short-title a');
                        const linkElem = item.querySelector('.short-title a');
                        const posterElem = item.querySelector('.short-img img');
                        const yearElem = item.querySelector('.short-date');
                        const descriptionElem = item.querySelector('.short-text');
                        
                        if (titleElem && linkElem) {
                            const title = titleElem.textContent.trim();
                            const url = linkElem.href;
                            const poster = posterElem ? posterElem.src : '';
                            let year = '';
                            
                            // Извлекаем год из даты или заголовка
                            if (yearElem) {
                                const yearMatch = yearElem.textContent.match(/(\d{4})/);
                                year = yearMatch ? yearMatch[1] : '';
                            }
                            
                            // Определяем тип контента
                            let type = 'movie';
                            if (title.toLowerCase().includes('сезон') || 
                                title.toLowerCase().includes('сериал') ||
                                url.includes('serial')) {
                                type = 'tv';
                            }
                            
                            results.push({
                                title: title,
                                year: year,
                                description: descriptionElem ? descriptionElem.textContent.trim() : '',
                                poster: poster,
                                url: url,
                                type: type,
                                id: url
                            });
                        }
                    } catch (e) {
                        console.error('Error parsing search result:', e);
                    }
                });
                
                return results;
            },

            // Парсинг результатов категории
            parseGroupResults: function(html) {
                return this.parseSearchResults(html);
            },

            // Парсинг детальной информации
            parseMovieDetails: function(html) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                const titleElem = doc.querySelector('.ftitle h1');
                const posterElem = doc.querySelector('.fposter img');
                const descriptionElem = doc.querySelector('.ftext');
                const yearElem = doc.querySelector('.fdate');
                
                // Извлекаем видео ссылки
                const videoLinks = this.extractVideoLinks(html);
                
                // Извлекаем информацию о сезонах и сериях
                const seasons = this.extractSeasons(doc);
                
                return {
                    title: titleElem ? titleElem.textContent.trim() : 'Неизвестно',
                    poster: posterElem ? posterElem.src : '',
                    description: descriptionElem ? descriptionElem.textContent.trim() : '',
                    year: yearElem ? yearElem.textContent.trim() : '',
                    videos: videoLinks,
                    seasons: seasons,
                    type: seasons.length > 0 ? 'tv' : 'movie'
                };
            },

            // Извлечение ссылок на видео
            extractVideoLinks: function(html) {
                const videos = [];
                
                // Ищем iframe с видео
                const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"/g);
                if (iframeMatch) {
                    iframeMatch.forEach(iframe => {
                        const srcMatch = iframe.match(/src="([^"]+)"/);
                        if (srcMatch && srcMatch[1]) {
                            videos.push({
                                title: 'Основное видео',
                                url: srcMatch[1],
                                quality: 'HD'
                            });
                        }
                    });
                }
                
                // Ищем прямые ссылки на видео
                const videoMatch = html.match(/(https?:\/\/[^\s"']+\.(mp4|m3u8)[^\s"']*)/gi);
                if (videoMatch) {
                    videoMatch.forEach(url => {
                        videos.push({
                            title: 'Прямая ссылка',
                            url: url,
                            quality: 'HD'
                        });
                    });
                }
                
                return videos;
            },

            // Извлечение информации о сезонах и сериях
            extractSeasons: function(doc) {
                const seasons = [];
                
                // Ищем элементы с сезонами
                const seasonElems = doc.querySelectorAll('.season-item, [class*="season"]');
                
                if (seasonElems.length > 0) {
                    seasonElems.forEach((seasonElem, index) => {
                        const season = {
                            title: `Сезон ${index + 1}`,
                            number: index + 1,
                            episodes: []
                        };
                        
                        // Ищем эпизоды в сезоне
                        const episodeElems = seasonElem.querySelectorAll('.episode-item, [class*="episode"]');
                        
                        episodeElems.forEach((episodeElem, epIndex) => {
                            const episodeLink = episodeElem.querySelector('a');
                            if (episodeLink) {
                                season.episodes.push({
                                    title: `Серия ${epIndex + 1}`,
                                    number: epIndex + 1,
                                    url: episodeLink.href
                                });
                            }
                        });
                        
                        // Если не нашли эпизоды, создаем фиктивные
                        if (season.episodes.length === 0) {
                            for (let i = 1; i <= 10; i++) {
                                season.episodes.push({
                                    title: `Серия ${i}`,
                                    number: i,
                                    url: '#'
                                });
                            }
                        }
                        
                        seasons.push(season);
                    });
                }
                
                return seasons;
            },

            // Вспомогательный метод для HTTP запросов
            makeRequest: function(url) {
                return new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('GET', this.proxyUrl(url), true);
                    xhr.setRequestHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
                    xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
                    
                    xhr.onreadystatechange = function() {
                        if (xhr.readyState === 4) {
                            if (xhr.status === 200) {
                                resolve(xhr.responseText);
                            } else {
                                reject(new Error('HTTP error: ' + xhr.status));
                            }
                        }
                    };
                    
                    xhr.onerror = function() {
                        reject(new Error('Network error'));
                    };
                    
                    xhr.send();
                });
            },

            // Прокси URL для обхода CORS
            proxyUrl: function(url) {
                // Используем CORS прокси
                return 'https://corsproxy.io/?' + encodeURIComponent(url);
            },

            // Получение TV информации
            tv: function(url) {
                return this.movie(url);
            },

            // Получение эпизода
            episode: function(url) {
                return new Promise((resolve) => {
                    this.makeRequest(url)
                        .then(html => {
                            const videoLinks = this.extractVideoLinks(html);
                            resolve({
                                success: true,
                                videos: videoLinks
                            });
                        })
                        .catch(error => {
                            resolve({
                                success: false,
                                error: error.message
                            });
                        });
                });
            }
        };
        
        console.log('Kinogo.media source successfully added!');
    }

    // Деинициализация плагина
    plugin.destroy = function() {
        if (window.Sources && Sources.kinogo) {
            delete Sources.kinogo;
            console.log('Kinogo.media source removed');
        }
    };

})(this.plugin = {});
