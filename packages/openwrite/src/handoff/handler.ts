import { publishInProject } from "@/bus"
import { messageCreated } from "@/bus"
import { Identifier } from "@/id"
import { Project } from "@/project"
import { Session } from "@/session"
import type { TaskHandler } from "@/task"
import type { TaskInfo } from "@/task"
import { HandoffSummarizer } from "./summarizer"
import { HandoffValidator } from "./validator"

export const handoffTaskHandler: TaskHandler = {
  type: "handoff",
  async execute(task: TaskInfo) {
    const project = await Project.get(task.project_id)
    const validation = await HandoffValidator.validate({ project, task })
    const handoffInput = validation.input
    const history = await Session.messagesByRun({
      sessionID: task.session_id,
      runID: handoffInput.from_run_id,
      defaultRunID: project.root_run_id,
    })
    const text = HandoffSummarizer.toUserMessage({
      task,
      handoffInput,
      handoff: validation.handoff,
      history,
    })

    const userMessageID = Identifier.ascending("message")
    const createdAt = Date.now()
    await Session.updateMessage({
      id: userMessageID,
      role: "user",
      sessionID: task.session_id,
      agent: handoffInput.target_agent_name,
      run_id: handoffInput.to_run_id,
      time: {
        created: createdAt,
      },
    })
    await Session.updatePart({
      id: Identifier.ascending("part"),
      sessionID: task.session_id,
      messageID: userMessageID,
      type: "text",
      text,
    })
    await publishInProject(task.project_id, messageCreated, {
      sessionID: task.session_id,
      messageID: userMessageID,
      role: "user",
      createdAt,
    })

    const switchedAt = Date.now()
    await Project.update(task.project_id, (draft) => {
      draft.curr_agent_name = handoffInput.target_agent_name
      draft.phase = "writing"
      draft.curr_run_id = handoffInput.to_run_id
    })

    return {
      handoff_user_message_id: userMessageID,
      switched_at: switchedAt,
    }
  },
}
