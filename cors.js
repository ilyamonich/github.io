// cors-helper.js - Плагин помощник для CORS
(function(plugin) {
    plugin.info = {
        title: 'CORS Helper',
        description: 'Помощник для обхода CORS ограничений',
        version: '1.0.0',
        author: 'Lampa Plugin Developer'
    };

    // Глобальная функция для CORS запросов
    window.corsRequest = function(url, options = {}) {
        return new Promise((resolve, reject) => {
            const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
            
            fetch(proxyUrl, options)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.text();
                })
                .then(data => resolve(data))
                .catch(error => reject(error));
        });
    };

    plugin.init = function() {
        console.log('CORS Helper initialized');
    };

    plugin.destroy = function() {
        delete window.corsRequest;
    };

})(this.plugin = {});
