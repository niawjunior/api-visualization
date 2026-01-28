import MainInterface from './components/MainInterface';

export default function Home() {
  return (
    <main className="h-full w-full flex flex-col bg-background relative selection:bg-primary/20 no-drag">
       <div className="flex-1 w-full flex overflow-hidden z-10 pt-2 px-2">
          <MainInterface />
       </div>
    </main>
  )
}
