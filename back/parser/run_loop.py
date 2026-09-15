import logging
import os
import time

import parser as parser_module

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s INFO %(message)s",
)
log = logging.getLogger("parser_loop")

INTERVAL_HOURS = float(os.environ.get("PARSE_INTERVAL_HOURS", "6"))
INTERVAL_SECONDS = INTERVAL_HOURS * 3600


def main() -> None:
    log.info(f"Запуск цикла парсера, интервал: {INTERVAL_HOURS} ч.")

    while True:
        try:
            parser_module.run()
        except Exception:
            log.exception(
                "Парсер упал с необработанной ошибкой, "
                "следующая попытка — по расписанию"
            )

        log.info(f"Следующий запуск через {INTERVAL_HOURS} ч.")
        time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    main()