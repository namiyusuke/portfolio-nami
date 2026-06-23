export default class Observer {
  constructor(target, options, documentElement = false, elemBottom = false, delay = 0) {
    this.targets = document.querySelectorAll(target);
    this.target = target;
    this.options = options;
    this.documentElement = documentElement;
    this.string = this.target.slice(4);
    this.elemBottom = elemBottom;
    this.delay = delay;
    this.options = {
      rootMargin: "-100% 0% 0% 0%",
      once: true,
      threshold: 0,
      ...options,
    };
    if (this.targets.length > 0) {
      this.init();
    }
  }
  init() {
    const doWhenIntersect = (entries) => {
      entries.forEach((entry) => {
        const applyClass = () => {
          if (this.documentElement) {
            if (this.elemBottom) {
              if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
                document.documentElement.classList.add(`is-${this.string}`);
              } else if (!this.options.once) {
                document.documentElement.classList.remove(`is-${this.string}`);
              }
            } else {
              if (entry.isIntersecting) {
                document.documentElement.classList.add(`is-${this.string}`);
              } else if (!this.options.once) {
                document.documentElement.classList.remove(`is-${this.string}`);
              }
            }
          } else {
            if (entry.isIntersecting) {
              entry.target.classList.add(`is-${this.string}`);
            } else if (!this.options.once) {
              entry.target.classList.remove(`is-${this.string}`);
            }
          }
        };

        if (this.delay > 0 && entry.isIntersecting) {
          setTimeout(applyClass, this.delay);
        } else {
          applyClass();
        }
      });
    };

    const observer = new IntersectionObserver(doWhenIntersect, this.options);
    this.targets.forEach((target) => {
      observer.observe(target);
    });
  }
}
