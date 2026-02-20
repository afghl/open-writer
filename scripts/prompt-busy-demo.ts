let isRunning = false
const waiters: Array<(value: string) => void> = []

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function doWork(input: string): Promise<string> {
  console.log("doWork", input, "isRunning", isRunning)
  if (isRunning) {
    // Someone else is already running. Return a Promise and wait.
    return new Promise<string>((resolve, reject) => {
      waiters.push(resolve)
    })
  }

  // This call becomes the "real" runner.
  isRunning = true

  try {
    await sleep(1000)
    const result = `result from "${input}"`
    return result
  } finally {
    isRunning = false
  }
}

async function demo() {
  const p1 = doWork("first call")
  const p2 = doWork("second call")
  console.log("waiters length", waiters.length)
  // The key point: callers just await, no special syntax.
  const r1 = await p1

  // Resolve every waiting Promise with the same value.
  for (const resolve of waiters) {
    resolve(r1)
  }
  waiters.length = 0

  const r2 = await p2

  console.log("caller1:", r1)
  console.log("caller2:", r2)
  console.log("same value:", r1 === r2)
}

// demo().catch(console.error)

async function newPromise() {
  return new Promise((resolve, reject) => {
    // 傳入 resolve 與 reject，表示資料成功與失敗
    console.log('Promise 開始')
    if (Math.random() / 2 > 0.5) {
      setTimeout(function () {
        // 3 秒時間後，透過 resolve 來表示完成
        resolve('3 秒時間(fulfilled)');
      }, 3000);
    } else {
      // 回傳失敗
      reject('失敗中的失敗(rejected)')
    }
  });
}

async function main() {
  try {
    const p = await newPromise()
    console.log(p)
  } catch (error) {
    console.error(error)
  }
}

main()