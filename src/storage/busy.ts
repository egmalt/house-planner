let busy = false

export const setBusy = (value: boolean) => {
  busy = value
}

export const isBusy = () => busy
