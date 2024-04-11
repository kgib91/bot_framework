# Injecting the bot

```JavaScript
import('https://kgib91.github.io/bot_framework/main.js')
.then(async (bot_framework) => {
  await bot_framework.initialize_async('bot');
});
```
