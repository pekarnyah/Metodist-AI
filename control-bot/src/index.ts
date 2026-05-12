import { bot } from './bot';
import { startNotificationPolling } from './services/notify.service';

async function main() {
  startNotificationPolling(bot);
  await bot.start();
  console.log('Metodist control bot started');
}

main().catch((error) => {
  console.error('Failed to start control bot', error);
  process.exit(1);
});
